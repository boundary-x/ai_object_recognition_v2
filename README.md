# 👁️ Boundary X - AI Object Recognition (MediaPipe)

**Boundary X - AI Object Recognition** is a high-performance web application that detects objects in real-time using Google's **MediaPipe (EfficientDet-Lite0)** model.

Designed for educational and prototyping environments, this app allows users to select specific objects to track (e.g., specific classes like 'person' or 'cup') and transmits the coordinate data of the **primary target** to external hardware (like BBC Micro:bit) via **Bluetooth (BLE)**.

![Project Status](https://img.shields.io/badge/Status-Active-success)
![Platform](https://img.shields.io/badge/Platform-Web-blue)
![Tech](https://img.shields.io/badge/Stack-p5.js%20%7C%20MediaPipe-orange)

## ✨ Key Features

### 1. ⚡ MediaPipe Powered Detection
- **EfficientDet-Lite0:** Uses the advanced MediaPipe Tasks Vision API for faster, smoother, and more accurate object detection compared to older browser-based models.
- **Selective Tracking:** Users can choose specific objects to detect from the 80+ COCO dataset classes (e.g., "person", "cell phone", "bottle").
- **Smart Targeting:** Automatically selects the object with the **highest confidence score** as the primary target (Blue Box) to prevent data conflict.

### 2. 📡 Bluetooth Low Energy (BLE) Control
- **Wireless Communication:** Connects directly to **BBC Micro:bit** (or compatible BLE devices) using the **Nordic UART Service**.
- **Data Throttling:** optimized data transmission (100ms interval) to ensure stable hardware control without buffer overflow.

### 3. 📱 Responsive & Sticky UI
- **Sticky Canvas:** The camera view remains **fixed (sticky)** at the top or side of the screen even when scrolling through controls on mobile devices.
- **Cross-Platform:** Fully responsive layout (PC, Tablet, Mobile) designed with the `Pretendard` font system.
- **Auto-Mirroring:** Smart camera handling that automatically flips the feed when using the front camera for intuitive interaction.

### 4. 🎨 Visual Feedback
- **Blue Box:** The Primary Target (The object whose data is being sent).
- **Green Box:** Other detected objects (visual only).
- **Real-time Status:** Displays the exact string data being sent to the hardware.

---

## 📡 Communication Protocol

When the system detects the selected object(s), it identifies the one with the highest confidence and sends a formatted string via Bluetooth.

**Data Format:**
```text
x{X_Center}y{Y_Center}w{Width}h{Height}d{Count}\n
```

**Details:**
- **x** Center X coordinate of the target (0 ~ 400). Adjusted for mirroring.
- **y:** Center Y coordinate of the target (0 ~ 300).
- **w:** Width of the bounding box.
- **h:** Height of the bounding box.
- **d:** Total number of selected objects currently detected.
- **\n:** End of Line character

**Examples:**
> **Target at (200, 150), size 100x100, 1 object detected:**
> `x200y150w100h100d1`

> **No object detected or Stop button pressed:**
> `stop`

**Tech Stack:**
- **Frontend:** HTML5, CSS3
- **Creative Coding:** p5.js (Canvas, Video handling)
- **AI Engine:** MediaPipe Tasks Vision (@mediapipe/tasks-vision)
- **Hardware I/O:** Web Bluetooth API (BLE)

**License:**
- Copyright © 2024 Boundary X Co. All rights reserved.
- All rights to the source code and design of this project belong to BoundaryX.
- Web: boundaryx.io
- Contact: https://boundaryx.io/contact
