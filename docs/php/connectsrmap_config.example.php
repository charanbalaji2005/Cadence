<?php
// Copy to connectsrmap_config.php TWO folders above the API script, i.e. OUTSIDE public_html:
//
//   /home/<account>/connectsrmap_config.php          <- this file (not web-accessible)
//   /home/<account>/public_html/api/typingmaster_connectsrmap_api.php
//
// Environment variables with the same names take priority if your host supports them.
// Use NEW values: the old API key and database password were exposed and must be rotated.
return [
    // Long random string (24+ characters). Put the same value in Cadence's SRMAP_API_KEY on Render.
    'SRMAP_API_KEY' => '',
    'DB_HOST'       => 'localhost',
    'DB_USER'       => '',
    'DB_PASS'       => '',
    'DB_NAME'       => '',
];
