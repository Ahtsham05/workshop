/** Shared by the leveller worklet and the code that instantiates it. */
export const VOICE_LEVELER_NAME = 'voice-leveler'

/**
 * Level the gain follower steers the speech envelope toward (dBFS). The envelope tracks the loud
 * parts of a phrase, so the long-term RMS of the result lands ~3-4 dB below this: -18 gives the
 * normal, comfortable narration level of about -21 dBFS RMS (measured on synthesised speech).
 */
export const LEVELER_TARGET_DBFS = -18

/** Below this the signal is treated as silence: the gain is frozen, so quiet gaps are never boosted. */
export const LEVELER_GATE_DBFS = -50

/** How far the leveller may turn speech up or down (dB). */
export const LEVELER_MAX_BOOST_DB = 18
export const LEVELER_MAX_CUT_DB = 9
