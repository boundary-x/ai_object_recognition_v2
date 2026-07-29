/*
 * sketch.js
 * Boundary X Object Detection (Powered by MediaPipe)
 * Features: Auto-Mirroring, Safety Stop, Optimized Rendering,
 *           Reliable BLE (disconnect detection/retry/timeout), GPU/CPU delegate switch,
 *           Lower-res capture + throttled inference for low-end phones
 */

import { ObjectDetector, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2";

// --- Bluetooth UUIDs (Microbit UART) ---
const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_TX_CHARACTERISTIC_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX_CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

// 주어진 프로미스가 정해진 시간 안에 끝나지 않으면 강제로 실패 처리 (BLE 응답이 영영 안 올 때 대비)
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('BLE write timeout')), ms))
  ]);
}

// --- Variables ---
let bluetoothDevice = null;
let rxCharacteristic = null;
let txCharacteristic = null;
let isConnected = false;
let bluetoothStatus = "연결 대기 중";
let isSendingData = false; 
let isManualDisconnect = false; // 사용자가 직접 '연결 해제'를 눌렀는지 구분
let lastSendErrorTime = 0; // 전송 실패 안내가 매 프레임 깜빡이지 않도록 최소 간격

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

// 성능 최적화: 카메라 캡처 해상도를 캔버스에 맞춰 제한 (저사양 기기에서 AI 연산량 감소)
const CAPTURE_WIDTH = 320;
const CAPTURE_HEIGHT = 240;

// 성능 최적화: 추론(AI 연산) 주기를 렌더링(화면 그리기)과 분리
// 렌더링은 계속 부드럽게 돌고, 무거운 추론만 별도 주기로 제한
const DETECTION_INTERVAL_MS = 100; // 최대 초당 10회 추론
let lastDetectionTime = 0;

// MediaPipe
let objectDetector;
let lastVideoTime = -1;
let isModelLoaded = false;
let selectedDelegate = "GPU"; // "GPU" 또는 "CPU"

// UI Elements
let switchCameraButton, connectBluetoothButton, disconnectBluetoothButton;
let startDetectionButton, stopDetectionButton;
let objectSelect, confidenceSlider;
let confidenceLabel;
let dataDisplay;
let selectedObjectsListDiv; 
let delegateSelect, delegateStatusDiv;

// --- MediaPipe Initialization ---
async function initializeMediaPipe() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm"
  );
  
  objectDetector = await ObjectDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`,
      delegate: selectedDelegate
    },
    scoreThreshold: 0.3, 
    runningMode: "VIDEO"
  });
  
  isModelLoaded = true;
  console.log(`MediaPipe Model Loaded! (delegate: ${selectedDelegate})`);
  if(startDetectionButton) startDetectionButton.html("사물 인식 시작");
}

// AI 연산 장치(GPU/CPU)를 바꿀 때 모델을 안전하게 다시 불러옴
async function switchDelegate(newDelegate) {
  if (newDelegate === selectedDelegate) return;

  const wasActive = isObjectDetectionActive;
  if (isObjectDetectionActive) {
    stopObjectDetection(); // 모델을 다시 불러오는 동안 로봇이 이전 상태로 계속 움직이지 않도록 안전 정지
  }

  if (delegateStatusDiv) delegateStatusDiv.html("⏳ AI 모델을 다시 불러오는 중입니다...");
  if (startDetectionButton) startDetectionButton.html("모델 로딩 중...");
  isModelLoaded = false;

  try {
    if (objectDetector && objectDetector.close) {
      objectDetector.close(); // 기존 모델 리소스 해제
    }
  } catch (e) {
    console.warn("이전 모델 해제 중 경고:", e);
  }

  selectedDelegate = newDelegate;

  try {
    await initializeMediaPipe();
    if (delegateStatusDiv) {
      delegateStatusDiv.html(`✅ ${newDelegate} 모드로 전환되었습니다.`);
    }
  } catch (e) {
    console.error("모델 재로드 실패:", e);
    if (delegateStatusDiv) delegateStatusDiv.html("❌ 모델을 다시 불러오지 못했습니다.");
    return;
  }

  if (wasActive) startObjectDetection();
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

              const packet = `x${Math.round(centerX)}y${Math.round(centerY)}w${Math.round(finalW)}h${Math.round(finalH)}d${detectedCount}`;
              sendBluetoothData(packet);

              const dataStr = `x${Math.round(centerX)} y${Math.round(centerY)} w${Math.round(finalW)} h${Math.round(finalH)} d${detectedCount}`;
              dataDisplay.html(`전송됨: ${dataStr}`);
              dataDisplay.style("color", "#0f0");
          } else {
              // 사물 없음 -> Stop 신호 전송
              sendBluetoothData("stop");
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
  // 성능 최적화: 캡처 해상도를 제한 (기기 기본값보다 훨씬 작게) → AI가 매 프레임 처리할 픽셀 수 감소
  let constraints = {
    video: {
      facingMode: facingMode,
      width: { ideal: CAPTURE_WIDTH },
      height: { ideal: CAPTURE_HEIGHT }
    },
    audio: false
  };

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
    stopObjectDetection(); // 정지 + stop 신호 전송(재시도 포함)까지 여기서 처리됨
  });

  updateBluetoothStatusUI();

  createDelegateUI();
}

// AI 연산 장치(GPU/CPU) 선택 UI — 기존 control-group/버튼 스타일을 그대로 재사용해
// index.html/style.css는 건드리지 않고 동적으로 생성
function createDelegateUI() {
  const controlsSection = select('.controls');
  if (!controlsSection) return;

  const group = createDiv();
  group.addClass('control-group');
  group.parent(controlsSection);

  const heading = createElement('h3', '⚙️ AI 연산 장치 설정');
  heading.parent(group);

  const desc = createElement('p',
    'GPU는 대부분의 기기에서 더 빠르지만, 일부 저사양·구형 스마트폰에서는 오히려 느리거나 불안정할 수 있습니다. ' +
    '화면이 버벅이거나 인식이 잘 안 되면 CPU로 전환해보세요. 전환하면 AI 모델을 다시 불러옵니다(몇 초 소요).'
  );
  desc.parent(group);

  delegateSelect = createSelect();
  delegateSelect.parent(group);
  delegateSelect.option('GPU (기본, 대부분 기기에서 빠름)', 'GPU');
  delegateSelect.option('CPU (저사양 기기에서 더 안정적)', 'CPU');
  delegateSelect.selected('GPU');
  delegateSelect.changed(() => {
    switchDelegate(delegateSelect.value());
  });

  delegateStatusDiv = createDiv('현재: GPU 모드');
  delegateStatusDiv.style('margin-top', '10px');
  delegateStatusDiv.style('font-size', '0.9rem');
  delegateStatusDiv.style('color', '#666');
  delegateStatusDiv.parent(group);
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
  if (isObjectDetectionActive) {
    stopObjectDetection(); // 전환하는 동안 로봇이 이전 상태로 계속 움직이지 않도록 안전 정지
  }
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

// 인식을 멈추고, sendStopSignal이 true면 마이크로비트에 stop 신호도 함께 전송
async function stopObjectDetection(sendStopSignal = true) {
  isObjectDetectionActive = false;
  detections = [];

  if (!sendStopSignal) return;

  const sent = await sendBluetoothDataReliable("stop");
  if (sent) {
    dataDisplay.html("전송됨: 없음 (Stop)");
    dataDisplay.style("color", "#888");
  } else if (isConnected) {
    // 연결은 되어있는데 전송만 실패한 경우에만 표시 (연결 자체가 끊긴 경우는 onDisconnected가 별도 처리)
    dataDisplay.html("⚠️ 정지 신호 전송 실패 - 연결을 확인해주세요");
    dataDisplay.style("color", "#EA4335");
  }
}

// MediaPipe Inference Loop
async function predictWebcam() {
  if (!isObjectDetectionActive || !isVideoReady || !video) return;

  const now = performance.now();
  // 성능 최적화: 추론은 DETECTION_INTERVAL_MS 간격으로만 실행 — 렌더링(draw)은 이 함수와 무관하게 계속 부드럽게 진행됨
  if (now - lastDetectionTime >= DETECTION_INTERVAL_MS && video.elt.currentTime !== lastVideoTime) {
    lastVideoTime = video.elt.currentTime;
    lastDetectionTime = now;
    const result = objectDetector.detectForVideo(video.elt, now);
    
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

    // 마이크로비트가 범위를 벗어나거나 전원이 꺼지는 등 예기치 않게 끊겼을 때도 상태를 동기화
    bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

    isConnected = true;
    bluetoothStatus = "연결됨: " + bluetoothDevice.name;
    updateBluetoothStatusUI(true);
  } catch (error) {
    console.error(error);
    bluetoothStatus = "연결 실패";
    updateBluetoothStatusUI(false, true);
  }
}

// 수동 해제든 예기치 않은 끊김이든 이 함수 하나로 상태를 정리
function onDisconnected() {
  isConnected = false;
  rxCharacteristic = null;
  txCharacteristic = null;
  bluetoothDevice = null;

  // 연결이 끊기면 인식도 함께 자동 중지 — 끊긴 채로 계속 돌아가는 것 방지
  // 이미 연결이 끊긴 상태라 stop 신호를 보내려는 시도(재시도 포함) 자체가 무의미하므로 생략
  const wasDetecting = isObjectDetectionActive;
  if (isObjectDetectionActive) {
    stopObjectDetection(false);
  }

  if (isManualDisconnect) {
    bluetoothStatus = "연결 해제됨";
    updateBluetoothStatusUI(false);
  } else {
    bluetoothStatus = "연결이 끊어졌습니다. 다시 연결해주세요.";
    updateBluetoothStatusUI(false, true);
  }

  if (wasDetecting) {
    dataDisplay.html(isManualDisconnect ? "연결 해제로 인식이 중지되었습니다" : "⚠️ 연결이 끊어져 인식이 자동으로 중지되었습니다");
    dataDisplay.style("color", isManualDisconnect ? "#888" : "#EA4335");
  }

  isManualDisconnect = false;
}

function disconnectBluetooth() {
  if (bluetoothDevice && bluetoothDevice.gatt.connected) {
    // 실제 상태 정리는 'gattserverdisconnected' 이벤트를 받는 onDisconnected()가 담당
    isManualDisconnect = true;
    bluetoothDevice.gatt.disconnect();
  } else {
    isConnected = false;
    bluetoothStatus = "연결 해제됨";
    rxCharacteristic = null;
    txCharacteristic = null;
    bluetoothDevice = null;
    updateBluetoothStatusUI(false);
  }
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

// 성공하면 true, 스킵되거나 실패하면 false를 반환
async function sendBluetoothData(data) {
  if (!rxCharacteristic || !isConnected) return false;
  if (isSendingData) return false;

  try {
    isSendingData = true;
    const encoder = new TextEncoder();
    // writeValue가 끝내 응답하지 않는 경우를 대비해 2초 타임아웃을 둠 (전송 영구 정지 방지)
    await withTimeout(rxCharacteristic.writeValue(encoder.encode(data + "\n")), 2000);
    return true;
  } catch (error) {
    console.error(error);
    const now = Date.now();
    if (now - lastSendErrorTime > 3000) {
      lastSendErrorTime = now;
      bluetoothStatus = "데이터 전송 실패 - 연결 상태를 확인해주세요";
      updateBluetoothStatusUI(false, true);
    }
    return false;
  } finally {
    isSendingData = false;
  }
}

// 'stop'처럼 반드시 전달되어야 하는 명령을 위한 재시도 버전
async function sendBluetoothDataReliable(data, maxRetries = 5, retryDelayMs = 80) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const sent = await sendBluetoothData(data);
    if (sent) return true;
    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
  }
  console.error(`전송 재시도 실패: ${data}`);
  return false;
}

// Global Scope Export (for HTML)
window.setup = setup;
window.draw = draw;
