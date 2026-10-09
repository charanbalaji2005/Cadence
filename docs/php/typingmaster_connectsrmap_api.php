<?php
// =====================================================================
// api/typingmaster_connectsrmap_api.php
// CONNECT SRMAP API for Cadence (TypingMaster)
//
// Actions:
//   verify        POST  Checks a student's password here, on the SRM AP server, and returns
//                       only the allow-listed profile fields. This is what Cadence signs students in with.
//   get_student   GET   One student's profile, by register_number or email (no password).
//   list_students GET   A page of profiles (no password). Cadence never calls this.
//
// Secrets are NOT in this file. They come from environment variables or from a config
// file stored OUTSIDE public_html (see connectsrmap_config.example.php).
// =====================================================================

error_reporting(0);
ini_set('display_errors', '0');
ob_start();

// Only servers call this API (Cadence calls it from its backend), so no CORS headers are sent:
// browsers on other sites can't read the responses.
header("Content-Type: application/json; charset=UTF-8");
header("Cache-Control: no-store");
header("X-Content-Type-Options: nosniff");

date_default_timezone_set('Asia/Kolkata');

function respond($status, $body) {
    ob_clean();
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    ob_end_flush();
    exit();
}

// =====================================================================
// 1. CONFIGURATION (no secrets in source)
// =====================================================================
// Order: environment variables, then a PHP file outside the web root that returns an array.
$CONFIG_FILE = dirname(__DIR__, 2) . '/connectsrmap_config.php';
$fileConfig = is_readable($CONFIG_FILE) ? (include $CONFIG_FILE) : [];
if (!is_array($fileConfig)) $fileConfig = [];

function cfg($name, $fileConfig) {
    $v = getenv($name);
    if ($v !== false && $v !== '') return $v;
    return isset($fileConfig[$name]) ? (string)$fileConfig[$name] : '';
}

$API_SECRET_KEY = cfg('SRMAP_API_KEY', $fileConfig);
$DB_HOST = cfg('DB_HOST', $fileConfig) ?: 'localhost';
$DB_USER = cfg('DB_USER', $fileConfig);
$DB_PASS = cfg('DB_PASS', $fileConfig);
$DB_NAME = cfg('DB_NAME', $fileConfig);

if ($API_SECRET_KEY === '' || strlen($API_SECRET_KEY) < 24 || $DB_USER === '' || $DB_NAME === '') {
    respond(500, ["status" => false, "message" => "Server is not configured."]);
}

// =====================================================================
// 2. API KEY AUTHENTICATION (header or POST body; never the URL, which ends up in access logs)
// =====================================================================
function get_auth_header($name) {
    $key = 'HTTP_' . str_replace('-', '_', strtoupper($name));
    if (!empty($_SERVER[$key])) return $_SERVER[$key];
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) {
            if (strcasecmp($k, $name) === 0) return $v;
        }
    }
    return '';
}

$sent_key = get_auth_header('X-API-KEY');
if ($sent_key === '') $sent_key = (string)($_POST['api_key'] ?? '');

if ($sent_key === '' || !hash_equals($API_SECRET_KEY, $sent_key)) {
    respond(401, ["status" => false, "code" => "invalid_api_key", "message" => "Unauthorized: Invalid or missing API Key."]);
}

// =====================================================================
// 3. DATABASE
// =====================================================================
mysqli_report(MYSQLI_REPORT_OFF);
$conn = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
if ($conn->connect_error) {
    respond(500, ["status" => false, "message" => "Database connection failure."]);
}
$conn->set_charset("utf8mb4");
$conn->query("SET time_zone = '+05:30'");

// =====================================================================
// 4. HELPERS
// =====================================================================
const PHOTO_BASE = "https://oursrmap.purlyedit.in";

function resolve_profile_photo($raw_photo, $gender) {
    $clean = trim((string)$raw_photo);
    $gender = strtolower(trim((string)$gender));
    $is_female = in_array($gender, ['female', 'f', 'girl', 'woman'], true);

    $default_avatar = $is_female
        ? PHOTO_BASE . "/def_female_profile.jpeg"
        : PHOTO_BASE . "/def_male_profile.jpeg";

    $placeholders = [
        '', '0', 'null', 'default.jpg', 'default.png', 'avatar.png',
        'def_male_profile.jpeg', 'def_female_profile.jpeg'
    ];

    if ($clean === '' || in_array(strtolower(basename($clean)), $placeholders, true)) {
        return $default_avatar;
    }
    if (strpos($clean, 'https://') === 0) return $clean;
    // Same host over https, so pages served over https can show it.
    if (strpos($clean, 'http://oursrmap.purlyedit.in/') === 0) return 'https://' . substr($clean, 7);
    if (strpos($clean, 'http://') === 0) return $clean;

    return PHOTO_BASE . "/uploads/profile_photos/" . ltrim($clean, '/');
}

// The only fields any action returns. `password` is never selected into a response.
function public_student($row) {
    return [
        "name"          => $row['name'],
        "email"         => $row['email'],
        "class"         => $row['class'],
        "section"       => $row['section'],
        "gender"        => $row['gender'],
        "profile_photo" => resolve_profile_photo($row['profile_photo'], $row['gender'])
    ];
}

$raw_input = file_get_contents('php://input');
$json_input = json_decode($raw_input, true);
if (!is_array($json_input)) $json_input = [];
$input = array_merge($_GET, $_POST, $json_input);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$action = trim((string)($input['action'] ?? 'get_student'));

// =====================================================================
// 5. ACTIONS
// =====================================================================

// --- verify: check a student's password HERE and return their verified identity ---
// Request (POST, JSON): { "identifier": "AP24110010895", "identifier_type": "register_number", "password": "..." }
//                    or { "identifier": "name@srmap.edu.in", "identifier_type": "email", "password": "..." }
// Success: 200 { status: true, verified: true, student: { student_id, register_number, name, email, class, section, gender, photo } }
// Wrong password OR unknown student (same answer, so it doesn't reveal who exists): 401 { status: false, verified: false }
if ($action === 'verify') {
    if ($method !== 'POST') {
        respond(405, ["status" => false, "code" => "method_not_allowed", "message" => "Use POST for verify."]);
    }
    $identifier = trim((string)($input['identifier'] ?? ''));
    $type = (string)($input['identifier_type'] ?? '');
    $plain = (string)($input['password'] ?? '');

    if ($identifier === '' || $plain === '' || strlen($identifier) > 254 || strlen($plain) > 256
        || !in_array($type, ['register_number', 'email'], true)) {
        respond(400, ["status" => false, "verified" => false, "message" => "identifier, identifier_type and password are required."]);
    }

    $column = $type === 'email' ? 'email' : 'register_number';
    $stmt = $conn->prepare("
        SELECT id, register_number, name, email, password, class, section, gender, profile_photo
        FROM students
        WHERE $column = ?
        LIMIT 1
    ");
    $stmt->bind_param("s", $identifier);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $conn->close();

    $hash = $row ? (string)$row['password'] : '';
    if ($row && $hash !== '') {
        $ok = password_verify($plain, $hash);
    } else {
        // Spend the same time as a real check so response timing doesn't reveal unknown students.
        password_verify($plain, password_hash(bin2hex(random_bytes(8)), PASSWORD_BCRYPT));
        $ok = false;
    }
    unset($plain, $hash);

    if (!$ok) {
        respond(401, ["status" => false, "verified" => false, "message" => "Invalid credentials."]);
    }

    $register_number = strtoupper(trim((string)$row['register_number']));
    $profile = public_student($row);
    respond(200, [
        "status"   => true,
        "verified" => true,
        "student"  => [
            // Stable and never reassigned: the register number, or the row id if a record has none.
            "student_id"      => $register_number !== '' ? $register_number : ('id-' . $row['id']),
            "register_number" => $register_number !== '' ? $register_number : null,
            "name"            => $profile['name'],
            "email"           => $profile['email'],
            "class"           => $profile['class'],
            "section"         => $profile['section'],
            "gender"          => $profile['gender'],
            "photo"           => $profile['profile_photo']
        ]
    ]);
}

// --- get_student: one student's profile (no password) ---
if ($action === 'get_student') {
    $identifier = trim((string)($input['register_number'] ?? $input['email'] ?? ''));
    if ($identifier === '') {
        respond(400, ["status" => false, "message" => "Parameter missing: Please provide register_number or email."]);
    }

    $stmt = $conn->prepare("
        SELECT name, email, class, section, gender, profile_photo
        FROM students
        WHERE register_number = ? OR email = ?
        LIMIT 1
    ");
    $stmt->bind_param("ss", $identifier, $identifier);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $conn->close();

    if (!$row) respond(404, ["status" => false, "message" => "Student not found."]);
    respond(200, ["status" => true, "student" => public_student($row)]);
}

// --- list_students: a page of profiles (no password) ---
if ($action === 'list_students') {
    $limit  = min(100, max(1, (int)($input['limit'] ?? 50)));
    $offset = max(0, (int)($input['offset'] ?? 0));

    $stmt = $conn->prepare("
        SELECT name, email, class, section, gender, profile_photo
        FROM students
        ORDER BY id ASC
        LIMIT ? OFFSET ?
    ");
    $stmt->bind_param("ii", $limit, $offset);
    $stmt->execute();
    $res = $stmt->get_result();

    $students = [];
    while ($row = $res->fetch_assoc()) $students[] = public_student($row);
    $stmt->close();
    $conn->close();

    respond(200, ["status" => true, "count" => count($students), "students" => $students]);
}

$conn->close();
respond(400, ["status" => false, "message" => "Unknown action provided."]);
