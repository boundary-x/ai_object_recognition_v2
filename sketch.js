/*
 * sketch.js
 * Boundary X Object Detection (Powered by MediaPipe)
 * UX Improved: Auto-Mirroring based on Camera Mode
 */

import { ObjectDetector, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2";

// Bluetooth UUIDs
const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_TX_CHARACTERISTIC_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX_CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

let bluetoothDevice = null;
let rxCharacteristic = null;
let txCharacteristic = null;
let isConnected = false;
let bluetoothStatus = "연결 대기 중";
let isSendingData = false; 

let lastSentTime = 0; 
const SEND_INTERVAL = 100; 

// Video variables
let video;
let detections = []; 
let selectedObjects = []; 
let confidenceThreshold = 50; 
let isObjectDetectionActive = false; 
let wasDetectingBeforeSwitch = false; 

// Camera variables
let facingMode = "user"; // 기본: 전방 카메라
let isFlipped = true;    // [UX 수정] 전방 카메라는 기본적으로 거울 모드(true)
let isVideoReady = false; 

// MediaPipe variables
let objectDetector;
let lastVideoTime = -1;
let isModelLoaded = false;

// UI elements
// flipButton 제거됨
let switchCameraButton, connectBluetoothButton, disconnectBluetoothButton;
let startDetectionButton, stopDetectionButton;
let objectSelect, confidenceSlider;
let confidenceLabel;
let dataDisplay;
let selectedObjectsListDiv; 

// --- MediaPipe Initialization ---
async function initializeMediaPipe() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm"
  );
  
  objectDetector = await ObjectDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`,
      delegate: "GPU" 
    },
    scoreThreshold: 0.3, 
    runningMode: "VIDEO"
  });
  
  isModelLoaded = true;
  console.log("MediaPipe Model Loaded!");
  
  if(startDetectionButton) startDetectionButton.html("사물 인식 시작");
}

// p5.js Setup
function setup() {
  let canvas = createCanvas(400, 300);
  canvas.parent('p5-container');
  canvas.style('border-radius', '16px');
  
  setupCamera();
  createUI();
  
  initializeMediaPipe();
}

function setupCamera() {
  isVideoReady = false;

  let constraints = {
    video: {
      facingMode: facingMode
    },
    audio: false
  };

  video = createCapture(constraints);
  video.hide(); 

  let videoLoadCheck = setInterval(() => {
    if (video.elt.readyState >= 2 && video.elt.videoWidth > 0) {
      isVideoReady = true;
      clearInterval(videoLoadCheck);
      console.log(`Camera Loaded: ${facingMode} (${video.elt.videoWidth}x${video.elt.videoHeight})`);
      
      if (wasDetectingBeforeSwitch) {
        startObjectDetection();
        wasDetectingBeforeSwitch = false;
      }
    }
  }, 100);
}

function stopVideo() {
    if (video) {
        if (video.elt.srcObject) {
            const tracks = video.elt.srcObject.getTracks();
            tracks.forEach(track => track.stop());
        }
        video.remove();
        video = null;
    }
}

function createUI() {
  dataDisplay = select('#dataDisplay');
  dataDisplay.html("전송 대기 중...");

  // [UX 수정] '좌우 반전' 버튼 코드 제거함
  // flipButton 관련 코드 삭제

  switchCameraButton = createButton("전후방 전환");
  switchCameraButton.parent('camera-control-buttons');
  switchCameraButton.addClass('start-button');
  switchCameraButton.mousePressed(switchCamera);

  // Bluetooth Buttons
  connectBluetoothButton = createButton("기기 연결");
  connectBluetoothButton.parent('bluetooth-control-buttons');
  connectBluetoothButton.addClass('start-button');
  connectBluetoothButton.mousePressed(connectBluetooth);

  disconnectBluetoothButton = createButton("연결 해제");
  disconnectBluetoothButton.parent('bluetooth-control-buttons');
  disconnectBluetoothButton.addClass('stop-button');
  disconnectBluetoothButton.mousePressed(disconnectBluetooth);

  // Object Selection
  objectSelect = createSelect();
  objectSelect.parent('object-select-container');
  objectSelect.option("사물을 선택하세요", ""); 
  
  const objectList = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light",
    "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
    "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
    "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard",
    "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
    "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard",
    "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase",
    "scissors", "teddy bear", "hair drier", "toothbrush"
  ];
  objectList.forEach((item) => objectSelect.option(item));
  
  objectSelect.changed(() => {
      const val = objectSelect.value();
      if(val && !selectedObjects.includes(val)) {
          addSelectedObject(val);
      }
      objectSelect.value(""); 
  });

  selectedObjectsListDiv = select('#selected-objects-list');

  // Confidence Slider
  confidenceSlider = createSlider(0, 100, 50);
  confidenceSlider.parent('confidence-container');
  updateSliderFill(confidenceSlider);

  confidenceSlider.input(() => {
    confidenceThreshold = confidenceSlider.value();
    if(confidenceLabel) confidenceLabel.html(`정확도 기준: ${confidenceThreshold}%`);
    updateSliderFill(confidenceSlider);
  });

  confidenceLabel = createDiv(`정확도 기준: ${confidenceThreshold}%`);
  confidenceLabel.parent('confidence-container');
  confidenceLabel.style('font-size', '1.2rem');
  confidenceLabel.style('font-weight', '700');
  confidenceLabel.style('color', '#000000');
  confidenceLabel.style('margin-top', '10px');

  // Control Buttons
  startDetectionButton = createButton("모델 로딩 중...");
  startDetectionButton.parent('object-control-buttons');
  startDetectionButton.addClass('start-button');
  startDetectionButton.mousePressed(() => {
    if (!isModelLoaded) {
      alert("AI 모델을 불러오는 중입니다. 잠시만 기다려주세요.");
      return;
    }
    if (!isConnected) {
      alert("블루투스가 연결되어 있지 않습니다!");
      return;
    }
    if (selectedObjects.length === 0) {
        alert("인식할 사물을 최소 1개 이상 선택해주세요.");
        return;
    }
    startObjectDetection();
  });

  stopDetectionButton = createButton("인식 중지");
  stopDetectionButton.parent('object-control-buttons');
  stopDetectionButton.addClass('stop-button');
  stopDetectionButton.mousePressed(() => {
    stopObjectDetection();
    sendBluetoothData("stop");
  });

  updateBluetoothStatusUI();
}

function updateSliderFill(slider) {
    const val = (slider.value() - slider.elt.min) / (slider.elt.max - slider.elt.min) * 100;
    slider.elt.style.background = `linear-gradient(to right, #000000 ${val}%, #D1D5DB ${val}%)`;
}

function addSelectedObject(objName) {
    selectedObjects.push(objName);
    renderSelectedObjects();
}

function removeSelectedObject(objName) {
    selectedObjects = selectedObjects.filter(item => item !== objName);
    renderSelectedObjects();
}

function renderSelectedObjects() {
    selectedObjectsListDiv.html(''); 
    selectedObjects.forEach(obj => {
        const tag = createDiv();
        tag.addClass('tag-item');
        tag.html(`${obj} <span class="tag-remove">&times;</span>`);
        tag.parent(selectedObjectsListDiv);
        tag.mouseClicked(() => removeSelectedObject(obj));
    });
}

// [UX 수정] 수동 반전 토글 함수 제거됨 (toggleFlip)

function switchCamera() {
  wasDetectingBeforeSwitch = isObjectDetectionActive;
  isObjectDetectionActive = false; 
  
  stopVideo(); 
  isVideoReady = false;
  
  // 카메라 모드 변경
  facingMode = facingMode === "user" ? "environment" : "user";
  
  // [UX 수정] 자동 반전 로직 적용
  // user(전방) 모드이면 -> true (거울 모드)
  // environment(후방) 모드이면 -> false (일반 모드)
  isFlipped = (facingMode === "user");

  setTimeout(setupCamera, 500);
}

function startObjectDetection() {
  if (!isVideoReady) {
      console.warn("카메라가 아직 준비되지 않았습니다.");
      return;
  }
  isObjectDetectionActive = true;
  predictWebcam(); 
}

function stopObjectDetection() {
  isObjectDetectionActive = false;
  detections = []; 
}

// --- MediaPipe Prediction Loop ---
async function predictWebcam() {
  if (!isObjectDetectionActive || !isVideoReady || !video) return;

  let startTimeMs = performance.now();

  if (video.elt.currentTime !== lastVideoTime) {
    lastVideoTime = video.elt.currentTime;
    
    const result = objectDetector.detectForVideo(video.elt, startTimeMs);
    
    if (result.detections) {
      detections = result.detections.map(d => {
        return {
          label: d.categories[0].categoryName.toLowerCase(), 
          confidence: d.categories[0].score, 
          x: d.boundingBox.originX,
          y: d.boundingBox.originY,
          width: d.boundingBox.width,
          height: d.boundingBox.height
        };
      });
    }
  }

  if (isObjectDetectionActive) {
    window.requestAnimationFrame(predictWebcam);
  }
}

function draw() {
  background(0); 

  if (!isVideoReady || !video || video.width === 0) {
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(16);
    text("카메라 로딩 중...", width / 2, height / 2);
    return;
  }

  // 화면 그리기 (isFlipped 값에 따라 자동 반전)
  push();
  if (isFlipped) {
    translate(width, 0);
    scale(-1, 1);
  }
  image(video, 0, 0, width, height);
  pop();

  if (isObjectDetectionActive && detections.length > 0) {
    let highestConfidenceObject = null;
    let detectedCount = 0; 

    let scaleX = width / video.elt.videoWidth;
    let scaleY = height / video.elt.videoHeight;

    detections.forEach((object) => {
      if (selectedObjects.includes(object.label) && object.confidence * 100 >= confidenceThreshold) {
        
        detectedCount++;

        if (!highestConfidenceObject || object.confidence > highestConfidenceObject.confidence) {
          highestConfidenceObject = object;
        }

        let drawX = object.x * scaleX;
        let drawY = object.y * scaleY;
        let drawW = object.width * scaleX;
        let drawH = object.height * scaleY;

        // 반전 상태일 때 좌표 계산 (자동 적용됨)
        if (isFlipped) {
            drawX = width - drawX - drawW;
        }

        stroke(0, 255, 0); 
        strokeWeight(2);
        noFill();
        rect(drawX, drawY, drawW, drawH);

        noStroke();
        fill(255);
        textSize(16);
        text(
          `${object.label} ${(object.confidence * 100).toFixed(0)}%`,
          drawX + 5,
          drawY > 20 ? drawY - 5 : drawY + 20
        );
      }
    });

    if (highestConfidenceObject) {
        let obj = highestConfidenceObject;
        
        let finalX = obj.x * scaleX;
        let finalY = obj.y * scaleY;
        let finalW = obj.width * scaleX;
        let finalH = obj.height * scaleY;

        let centerX = finalX + finalW / 2;
        let centerY = finalY + finalH / 2;

        // 데이터 전송 좌표 계산
        if (isFlipped) {
            centerX = width - centerX;
        }
        
        // 파란색 타겟 박스
        let bx = isFlipped ? width - finalX - finalW : finalX;
        stroke(0, 100, 255);
        strokeWeight(4);
        noFill();
        rect(bx, finalY, finalW, finalH);

        let currentTime = millis();
        if (currentTime - lastSentTime > SEND_INTERVAL) {
            sendBluetoothData(centerX, centerY, finalW, finalH, detectedCount);
            lastSentTime = currentTime;
            
            const dataStr = `x${Math.round(centerX)} y${Math.round(centerY)} w${Math.round(finalW)} h${Math.round(finalH)} d${detectedCount}`;
            dataDisplay.html(`전송됨: ${dataStr}`);
            dataDisplay.style("color", "#0f0");
        }
    }
  }
}

/* --- Bluetooth Logic (기존 유지) --- */

async function connectBluetooth() {
  try {
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "BBC micro:bit" }],
      optionalServices: [UART_SERVICE_UUID]
    });

    const server = await bluetoothDevice.gatt.connect();
    const service = await server.getPrimaryService(UART_SERVICE_UUID);
    rxCharacteristic = await service.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);
    txCharacteristic = await service.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);
    txCharacteristic.startNotifications();

    isConnected = true;
    bluetoothStatus = "연결됨: " + bluetoothDevice.name;
    updateBluetoothStatusUI(true);
    
  } catch (error) {
    console.error("Bluetooth connection failed:", error);
    bluetoothStatus = "연결 실패";
    updateBluetoothStatusUI(false, true);
  }
}

function disconnectBluetooth() {
  if (bluetoothDevice && bluetoothDevice.gatt.connected) {
    bluetoothDevice.gatt.disconnect();
  }
  isConnected = false;
  bluetoothStatus = "연결 해제됨";
  rxCharacteristic = null;
  txCharacteristic = null;
  bluetoothDevice = null;
  updateBluetoothStatusUI(false);
}

function updateBluetoothStatusUI(connected = false, error = false) {
  const statusElement = select('#bluetoothStatus');
  if(statusElement) {
      statusElement.html(`상태: ${bluetoothStatus}`);
      statusElement.removeClass('status-connected');
      statusElement.removeClass('status-error');
      
      if (connected) {
        statusElement.addClass('status-connected');
      } else if (error) {
        statusElement.addClass('status-error');
      }
  }
}

async function sendBluetoothData(x, y, width, height, detectedCount) {
  if (!rxCharacteristic || !isConnected) return;
  if (isSendingData) return;

  try {
    isSendingData = true; 

    if (x === "stop") {
      const encoder = new TextEncoder();
      await rxCharacteristic.writeValue(encoder.encode("stop\n"));
      return;
    }
    
    if (detectedCount > 0) {
      const data = `x${Math.round(x)}y${Math.round(y)}w${Math.round(width)}h${Math.round(height)}d${detectedCount}\n`;
      const encoder = new TextEncoder();
      await rxCharacteristic.writeValue(encoder.encode(data));
    }

  } catch (error) {
    console.error("Error sending data:", error);
  } finally {
    isSendingData = false; 
  }
}

window.setup = setup;
window.draw = draw;
