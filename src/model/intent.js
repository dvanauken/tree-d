// intent.js - Default instance intent.
//
// Pipeline stage 2: the project-level request laid over a species profile.
// Age class, seed, and site response. Callers override individual fields;
// anything omitted falls back to these defaults.

export default {
    ageClass: 'mature', // 'young' | 'mature' | 'old'
    seed: 1,
};
