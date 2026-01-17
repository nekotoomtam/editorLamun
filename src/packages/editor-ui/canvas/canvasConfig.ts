export const CANVAS_CONFIG = {
    paddingPx: 24,

    zoom: {
        // ใช้ค่าชุดเดียวกันทั้งปุ่ม +/- และ ctrl/meta + wheel
        min: 0.25,
        max: 3,
    },

    viewingDeadZone: {
        topRatio: 0.35,
        bottomRatio: 0.65,
        // ถ้าตูมเคยจูนแล้วนิ่ง ก็ล็อกค่าไว้ที่นี่
    },

    navigation: {
        programmaticCooldownMs: 120,
        smoothDistancePages: 5,
    },

    virtualization: {
        overscanPages: 6,
        overscanMaxExtraPages: 10,
        keepAroundPages: 10,
    },

    renderLevel: {
        fullRadius: 2,
        skeletonRadius: 8,
    },

    gap: {
        radiusPages: 1,
    },

} as const;
