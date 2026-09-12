# Validation

## Guide and support (2026-09-12)

- `node tests/support.cjs`: 11 walkthrough steps at 320, 360, 390, 430, 768, 844 (landscape), and 1280 pixel widths; panel bounds, visible non-overlapping highlights, page overflow, chapter navigation, connection skip, Escape/focus restoration, unchanged app state, contextual help, and no uncaught browser errors.
- Real MediaPipe Tasks Vision 1.0.1 initialization with simulated camera input; screenshots generated for visual review.
- `node tests/upgrade.cjs`: real model inference on 0.10.2 and 1.0.1 with GPU/CPU/GPU switching, simulated BLE coordinate packets, missing-target stop, and explicit stop.
- Existing label drawing and runtime/model versions are retained. Only a stable target ID and placement before the support card were added to the delegate settings UI.

These checks use desktop Microsoft Edge and simulated camera/BLE input. They do not establish recognition accuracy, speed improvements, physical phone compatibility, or successful receipt by a physical micro:bit. MakeCode links were taken from the introduction page; hardware project behavior was not exercised.
