/*
 * sketch.js
 * Boundary X Object Detection (Powered by MediaPipe)
 * Feature: Auto-Mirroring & Safety Stop Signal (Fixed)
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
let facingMode = "user"; 
let isFlipped = true;    
let isVideoReady = false; 

// MediaPipe variables
let objectDetector;
let lastVideoTime = -1;
let isModelLoaded = false;

// UI elements
let switchCameraButton, connectBluetoothButton, disconnectBluetoothButton;
let startDetectionButton, stopDetectionButton;
let objectSelect, confidenceSlider;
let confidenceLabel;
let dataDisplay;
let selectedObjectsListDiv; 

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

function switchCamera() {
  wasDetectingBeforeSwitch = isObjectDetectionActive;
  isObjectDetectionActive = false; 
  stopVideo(); 
  isVideoReady = false;
  
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

function draw() {
  background(0); 

  if (!isVideoReady || !video || video.width === 0) {
    fill(255); textAlign(CENTER, CENTER); textSize(16);
    text("카메라 로딩 중...", width / 2, height / 2);
    return;
  }

  push();
  if (isFlipped) { translate(width, 0); scale(-1, 1); }
  image(video, 0, 0, width, height);
  pop();

  // 변수 초기화 (매 프레임마다)
  let highestConfidenceObject = null;
  let detectedCount = 0; 
  let scaleX = width / video.elt.videoWidth;
  let scaleY = height / video.elt.videoHeight;

  if (isObjectDetectionActive && detections.length > 0) {
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

        if (isFlipped) drawX = width - drawX - drawW;

        stroke(0, 255, 0); strokeWeight(2); noFill();
        rect(drawX, drawY, drawW, drawH);
        noStroke(); fill(255); textSize(16);
        text(`${object.label} ${(object.confidence * 100).toFixed(0)}%`, drawX + 5, drawY > 20 ? drawY - 5 : drawY + 20);
      }
    });
  }

  // [수정된 부분] 전송 로직을 if문 밖으로 빼서, 사물이 없어도 실행되게 함
  if (isObjectDetectionActive) {
      let currentTime = millis();
      if (currentTime - lastSentTime > SEND_INTERVAL) {
          
          if (highestConfidenceObject) {
              // --- 사물이 인식된 경우 ---
              let obj = highestConfidenceObject;
              let finalX = obj.x * scaleX;
              let finalY = obj.y * scaleY;
              let finalW = obj.width * scaleX;
              let finalH = obj.height * scaleY;
              let centerX = finalX + finalW / 2;
              let centerY = finalY + finalH / 2;

              if (isFlipped) centerX = width - centerX;
              
              // 파란색 타겟 박스
              let bx = isFlipped ? width - finalX - finalW : finalX;
              stroke(0, 100, 255); strokeWeight(4); noFill();
              rect(bx, finalY, finalW, finalH);

              // 데이터 전송
              sendBluetoothData(centerX, centerY, finalW, finalH, detectedCount);
              
              const dataStr = `x${Math.round(centerX)} y${Math.round(centerY)} w${Math.round(finalW)} h${Math.round(finalH)} d${detectedCount}`;
              dataDisplay.html(`전송됨: ${dataStr}`);
              dataDisplay.style("color", "#0f0");
          } else {
              // --- [중요] 사물이 인식되지 않은 경우 (d=0) ---
              // 감지된 수가 0이면 "stop" 신호를 보냄
              sendBluetoothData(0, 0, 0, 0, 0);
              
              dataDisplay.html(`전송됨: 없음 (Stop)`);
              dataDisplay.style("color", "#888"); // 회색으로 표시
          }
          lastSentTime = currentTime;
      }
  }
}

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
    
    // [수정] 명시적인 "stop" 문자열 전송
    if (x === "stop" || detectedCount === 0) {
      const encoder = new TextEncoder();
      // 마이크로비트 코드에서 if (data == "stop") 조건을 타도록 전송
      await rxCharacteristic.writeValue(encoder.encode("stop\n"));
      return;
    }
    
    // 정상 데이터 전송
    if (detectedCount > 0) {
      const data = `x${Math.round(x)}y${Math.round(y)}w${Math.round(width)}h${Math.round(height)}d${detectedCount}\n`;
      const encoder = new TextEncoder();
      await rxCharacteristic.writeValue(encoder.encode(data));
    }

  } catch (error) { console.error(error); } 
  finally { isSendingData = false; }
}

window.setup = setup;
window.draw = draw;
