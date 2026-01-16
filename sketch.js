/*
 * sketch.js
 * Boundary X Object Detection (Powered by MediaPipe)
 * Features: Auto-Mirroring, Safety Stop, Optimized Rendering
 */

import { ObjectDetector, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2";

// --- Bluetooth UUIDs (Microbit UART) ---
const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_TX_CHARACTERISTIC_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX_CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

// --- Variables ---
let bluetoothDevice = null;
let rxCharacteristic = null;
let txCharacteristic = null;
let isConnected = false;
let bluetoothStatus = "연결 대기 중";
let isSendingData = false; 

let lastSentTime = 0; 
const SEND_INTERVAL = 100; // 데이터 전송 간격 (ms)

// Video & AI
let video;
let detections = []; 
let selectedObjects = []; 
let confidenceThreshold = 50; 
let isObjectDetectionActive = false; 
let wasDetectingBeforeSwitch = false; 

// Camera Control
let facingMode = "user"; // 초기값: 전방 카메라
let isFlipped = true;    // 초기값: 거울 모드 (전방이니까)
let isVideoReady = false; 

// MediaPipe
let objectDetector;
let lastVideoTime = -1;
let isModelLoaded = false;

// UI Elements
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
      delegate: "GPU" // 모바일 GPU 가속 사용
    },
    scoreThreshold: 0.3, 
    runningMode: "VIDEO"
  });
  
  isModelLoaded = true;
  console.log("MediaPipe Model Loaded!");
  if(startDetectionButton) startDetectionButton.html("사물 인식 시작");
}

// --- p5.js Main Functions ---

function setup() {
  // 400x300 캔버스 생성
  let canvas = createCanvas(400, 300);
  canvas.parent('p5-container');
  canvas.style('border-radius', '16px');
  
  setupCamera();
  createUI();
  initializeMediaPipe();
}

function draw() {
  background(0); 

  // 카메라 준비 안됐으면 로딩 텍스트
  if (!isVideoReady || !video || video.width === 0) {
    fill(255); textAlign(CENTER, CENTER); textSize(16);
    text("카메라 로딩 중...", width / 2, height / 2);
    return;
  }

  // 화면 그리기 (반전 여부에 따라 처리)
  push();
  if (isFlipped) { translate(width, 0); scale(-1, 1); }
  image(video, 0, 0, width, height);
  pop();

  // 변수 초기화
  let highestConfidenceObject = null;
  let detectedCount = 0; 
  let scaleX = width / video.elt.videoWidth;
  let scaleY = height / video.elt.videoHeight;
  
  // 1. 대장(Target) 찾기
  if (isObjectDetectionActive && detections.length > 0) {
    detections.forEach((object) => {
      if (selectedObjects.includes(object.label) && object.confidence * 100 >= confidenceThreshold) {
        if (!highestConfidenceObject || object.confidence > highestConfidenceObject.confidence) {
          highestConfidenceObject = object;
        }
      }
    });
  }

  // 2. 박스 그리기 (파란색 or 초록색)
  if (isObjectDetectionActive && detections.length > 0) {
    detections.forEach((object) => {
      if (selectedObjects.includes(object.label) && object.confidence * 100 >= confidenceThreshold) {
        
        detectedCount++;
        
        let drawX = object.x * scaleX;
        let drawY = object.y * scaleY;
        let drawW = object.width * scaleX;
        let drawH = object.height * scaleY;

        // 반전 모드일 때 좌표 보정
        if (isFlipped) drawX = width - drawX - drawW;

        if (object === highestConfidenceObject) {
            // [Target] 파란색 진한 박스
            stroke(0, 100, 255); strokeWeight(4); noFill();
            rect(drawX, drawY, drawW, drawH);
            
            // 라벨 배경
            noStroke(); fill(0, 100, 255);
            rect(drawX, drawY > 20 ? drawY - 25 : drawY, textWidth(object.label) + 55, 25);
            
            // 라벨 텍스트
            fill(255); textSize(16); textStyle(BOLD);
            text(`${object.label} ${(object.confidence * 100).toFixed(0)}%`, drawX + 5, drawY > 20 ? drawY - 7 : drawY + 18);
            
        } else {
            // [Others] 초록색 얇은 박스
            stroke(0, 255, 0); strokeWeight(2); noFill();
            rect(drawX, drawY, drawW, drawH);
            
            noStroke(); fill(0, 255, 0); textSize(14); textStyle(NORMAL);
            text(`${object.label} ${(object.confidence * 100).toFixed(0)}%`, drawX + 5, drawY > 20 ? drawY - 5 : drawY + 20);
        }
      }
    });
  }

  // 3. 데이터 전송 (대장 좌표 기준 or Stop 신호)
  if (isObjectDetectionActive) {
      let currentTime = millis();
      if (currentTime - lastSentTime > SEND_INTERVAL) {
          
          if (highestConfidenceObject) {
              // 사물 인식됨 -> 좌표 전송
              let obj = highestConfidenceObject;
              let finalX = obj.x * scaleX;
              let finalY = obj.y * scaleY;
              let finalW = obj.width * scaleX;
              let finalH = obj.height * scaleY;
              
              let centerX = finalX + finalW / 2;
              let centerY = finalY + finalH / 2;

              // 반전 모드 시 중심 좌표도 반전
              if (isFlipped) centerX = width - centerX;
              
              sendBluetoothData(centerX, centerY, finalW, finalH, detectedCount);
              
              const dataStr = `x${Math.round(centerX)} y${Math.round(centerY)} w${Math.round(finalW)} h${Math.round(finalH)} d${detectedCount}`;
              dataDisplay.html(`전송됨: ${dataStr}`);
              dataDisplay.style("color", "#0f0");
          } else {
              // 사물 없음 -> Stop 신호 전송 (d=0)
              sendBluetoothData(0, 0, 0, 0, 0);
              dataDisplay.html(`전송됨: 없음 (Stop)`);
              dataDisplay.style("color", "#888");
          }
          lastSentTime = currentTime;
      }
  }
}

// --- Helper Functions ---

function setupCamera() {
  isVideoReady = false;
  let constraints = { video: { facingMode: facingMode }, audio: false };

  video = createCapture(constraints);
  video.hide(); 

  let videoLoadCheck = setInterval(() => {
    if (video.elt.readyState >= 2 && video.elt.videoWidth > 0) {
      isVideoReady = true;
      clearInterval(videoLoadCheck);
      console.log(`Camera Loaded: ${facingMode}`);
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

  // Buttons
  switchCameraButton = createButton("전후방 전환");
  switchCameraButton.parent('camera-control-buttons');
  switchCameraButton.addClass('start-button');
  switchCameraButton.mousePressed(switchCamera);

  connectBluetoothButton = createButton("기기 연결");
  connectBluetoothButton.parent('bluetooth-control-buttons');
  connectBluetoothButton.addClass('start-button');
  connectBluetoothButton.mousePressed(connectBluetooth);

  disconnectBluetoothButton = createButton("연결 해제");
  disconnectBluetoothButton.parent('bluetooth-control-buttons');
  disconnectBluetoothButton.addClass('stop-button');
  disconnectBluetoothButton.mousePressed(disconnectBluetooth);

  // Selector
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
      if(val && !selectedObjects.includes(val)) addSelectedObject(val);
      objectSelect.value(""); 
  });

  selectedObjectsListDiv = select('#selected-objects-list');

  // Slider
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

  // Start/Stop Buttons
  startDetectionButton = createButton("모델 로딩 중...");
  startDetectionButton.parent('object-control-buttons');
  startDetectionButton.addClass('start-button');
  startDetectionButton.mousePressed(() => {
    if (!isModelLoaded) { alert("AI 모델 로딩 중입니다."); return; }
    if (!isConnected) { alert("블루투스가 연결되지 않았습니다!"); return; }
    if (selectedObjects.length === 0) { alert("사물을 선택해주세요."); return; }
    startObjectDetection();
  });

  stopDetectionButton = createButton("인식 중지");
  stopDetectionButton.parent('object-control-buttons');
  stopDetectionButton.addClass('stop-button');
  stopDetectionButton.mousePressed(() => {
    stopObjectDetection();
    sendBluetoothData("stop"); // 정지 시 Stop 신호 전송
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

function switchCamera() {
  wasDetectingBeforeSwitch = isObjectDetectionActive;
  isObjectDetectionActive = false; 
  stopVideo(); 
  isVideoReady = false;
  
  // 카메라 전환 및 자동 거울 모드 설정
  facingMode = facingMode === "user" ? "environment" : "user";
  isFlipped = (facingMode === "user");

  setTimeout(setupCamera, 500);
}

function startObjectDetection() {
  if (!isVideoReady) { console.warn("카메라 준비 안됨"); return; }
  isObjectDetectionActive = true;
  predictWebcam(); 
}

function stopObjectDetection() {
  isObjectDetectionActive = false;
  detections = []; 
}

// MediaPipe Inference Loop
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
  if (isObjectDetectionActive) window.requestAnimationFrame(predictWebcam);
}

// --- Bluetooth Logic ---

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
    console.error(error);
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
      if (connected) statusElement.addClass('status-connected');
      else if (error) statusElement.addClass('status-error');
  }
}

async function sendBluetoothData(x, y, width, height, detectedCount) {
  if (!rxCharacteristic || !isConnected) return;
  if (isSendingData) return;
  
  try {
    isSendingData = true; 
    
    // Stop 신호 처리 (좌표가 stop 이거나 감지된 수가 0일 때)
    if (x === "stop" || detectedCount === 0) {
      const encoder = new TextEncoder();
      await rxCharacteristic.writeValue(encoder.encode("stop\n"));
      return;
    }
    
    // 일반 데이터 전송
    if (detectedCount > 0) {
      const data = `x${Math.round(x)}y${Math.round(y)}w${Math.round(width)}h${Math.round(height)}d${detectedCount}\n`;
      const encoder = new TextEncoder();
      await rxCharacteristic.writeValue(encoder.encode(data));
    }

  } catch (error) { console.error(error); } 
  finally { isSendingData = false; }
}

// Global Scope Export (for HTML)
window.setup = setup;
window.draw = draw;
