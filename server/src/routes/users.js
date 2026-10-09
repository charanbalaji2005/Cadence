import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { User } from '../models/User.js';
import { Result } from '../models/Result.js';
import { IdentityBinding } from '../models/IdentityBinding.js';
import { sanitizeStudentPhoto } from '../services/srmap/profile.js';
import { requireAuth } from '../middleware/auth.js';
import { validateUsername } from '../utils/username.js';
import { track } from '../services/events.js';

const router = Router();

async function attachSrmapDetails(publicUser, userId) {
  try {
    const binding = await IdentityBinding.findOne({ user: userId, active: true }).lean();
    if (binding) {
      const studentPhoto = sanitizeStudentPhoto(binding.profilePhoto, binding.gender);
      publicUser.connections = publicUser.connections || {};
      publicUser.connections.srm_ap = {
        verified: true,
        name: binding.displayName || '',
        displayName: binding.displayName || '',
        registerNumberMasked: binding.registerNumberMasked || 'Apxxxxxxxxxxx',
        email: binding.verifiedEmail || '',
        gender: binding.gender || '',
        className: binding.className || '',
        section: binding.section || '',
        profilePhoto: studentPhoto,
        batchYear: binding.batchYear ?? null
      };
      if (!publicUser.avatar) {
        publicUser.avatar = studentPhoto;
      }
    }
  } catch (err) {
    console.error('Failed to attach SRM AP details:', err);
  }
}

// Lightweight rate limiter for username availability checks
const checkLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60, // 60 checks per minute per IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { available: false, reason: 'Please wait a moment and try again.' }
});

/**
 * GET /api/users/username/check?username=charan75
 * Fast, debounced availability check
 */
router.get('/username/check', checkLimiter, async (req, res) => {
  const raw = req.query.username;
  if (!raw) {
    return res.json({ available: false, reason: 'Username is required.' });
  }

  const { valid, error, normalized } = validateUsername(raw);
  if (!valid) {
    return res.json({ available: false, reason: error });
  }

  try {
    // If authenticated, allow user to keep their current username
    const currentUserId = req.user?._id;
    const query = {
      $or: [{ usernameNormalized: normalized }, { usernameLower: normalized }]
    };
    if (currentUserId) {
      query._id = { $ne: currentUserId };
    }

    const taken = await User.exists(query);
    if (taken) {
      return res.json({ available: false, reason: 'Username already taken' });
    }

    return res.json({ available: true, normalized });
  } catch (err) {
    console.error('Username check error:', err);
    return res.status(500).json({ available: false, reason: "Couldn't check username. Try again." });
  }
});

/**
 * GET /api/users/me
 * Returns current authenticated user profile
 */
router.get('/me', requireAuth, async (req, res) => {
  const publicUser = req.user.toPublic();
  if (req.user.connectedAccounts?.srm_ap?.verified || req.user.provider === 'srm_ap') {
    await attachSrmapDetails(publicUser, req.user._id);
  }
  res.json({
    user: publicUser,
    needsOnboarding: req.user.profileCompleted === false
  });
});

/**
 * PATCH /api/users/me/profile
 * Completes onboarding and sets username
 */
router.patch('/me/profile', requireAuth, async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required.' });
  }

  const { valid, error, normalized } = validateUsername(username);
  if (!valid) {
    return res.status(400).json({ error });
  }

  try {
    // Check if another user already has this normalized username
    const existing = await User.findOne({
      _id: { $ne: req.user._id },
      $or: [{ usernameNormalized: normalized }, { usernameLower: normalized }]
    });
    if (existing) {
      return res.status(409).json({ error: 'That username is already taken. Please choose another.' });
    }

    // Atomic update
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          username: normalized,
          usernameLower: normalized,
          usernameNormalized: normalized,
          profileCompleted: true
        }
      },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found.' });
    }
    track('PROFILE_UPDATED', { user: updatedUser, metadata: { field: 'username', onboarding: true } });

    return res.json({
      success: true,
      user: updatedUser.toPublic()
    });
  } catch (err) {
    // Handle MongoDB duplicate key error code 11000
    if (err.code === 11000) {
      return res.status(409).json({ error: 'That username was just taken. Please choose another.' });
    }
    console.error('Update profile error:', err);
    return res.status(500).json({ error: 'Failed to update username. Try again.' });
  }
});

/**
 * GET /api/users/:username
 * Public profile data
 */
router.get('/:username', async (req, res) => {
  try {
    const raw = req.params.username;
    const normalized = raw.toLowerCase().trim();
    const user = await User.findOne({
      $or: [{ usernameNormalized: normalized }, { usernameLower: normalized }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const results = await Result.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const resultsCount = results.length;
    let bestWpm = 0;
    let totalWpm = 0;
    let totalAcc = 0;
    let totalTime = 0;

    for (const r of results) {
      const w = Number(r.wpm) || 0;
      if (w > bestWpm) bestWpm = w;
      totalWpm += w;
      totalAcc += Number(r.acc) || 0;
      totalTime += Number(r.time) || (r.mode === 'time' ? Number(r.modeValue) || 15 : 15);
    }

    const avgWpm = resultsCount ? Math.round(totalWpm / resultsCount) : 0;
    const avgAcc = resultsCount ? Math.round((totalAcc / resultsCount) * 10) / 10 : 0;

    const publicUser = user.toPublic();

    if (user.connectedAccounts?.srm_ap?.verified || user.provider === 'srm_ap') {
      await attachSrmapDetails(publicUser, user._id);
    }

    // Do not leak user personal account email to public viewers
    if (!req.user || req.user._id.toString() !== user._id.toString()) {
      delete publicUser.email;
    }

    const recentResults = results.slice(0, 50).map(r => ({
      ...r,
      date: r.createdAt ? new Date(r.createdAt).getTime() : (r.date || Date.now())
    }));

    return res.json({
      user: publicUser,
      stats: {
        resultsCount,
        bestWpm: Math.round(bestWpm),
        avgWpm,
        avgAcc,
        totalTime: Math.round(totalTime)
      },
      resultsCount,
      recentResults
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error loading user profile.' });
  }
});

export default router;
