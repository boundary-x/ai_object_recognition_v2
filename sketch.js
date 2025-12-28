/**
 * sketch.js
 * Boundary X Object Detection
 * Fixed: Camera Switch Bug (Resource Lock & Constraints)
 */

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
const SEND_INTERVAL = 100; // 0.1초 전송

// Video and ML variables
let video;
let detector;
let detections = [];
let selectedObjects = []; 
let confidenceThreshold = 50; 
let isObjectDetectionActive = false; 
let wasDetectingBeforeSwitch = false; 

// Camera variables
let facingMode = "user"; 
let isFlipped = false;  
let isVideoReady = false; // 카메라 준비 상태 체크

// UI elements
let flipButton, switchCameraButton, connectBluetoothButton, disconnectBluetoothButton;
let startDetectionButton, stopDetectionButton;
let objectSelect, confidenceSlider;
let confidenceLabel;
let dataDisplay;
let selectedObjectsListDiv; 

function preload() {
  detector = ml5.objectDetector("cocossd");
}

function setup() {
  let canvas = createCanvas(400, 400); // 1:1 정사각형 캔버스
  canvas.parent('p5-container');
  canvas.style('border-radius', '16px');
  
  setupCamera();
  createUI();
}

function setupCamera() {
  isVideoReady = false; // 초기화 시작

  let constraints = {
    video: {
      facingMode: facingMode
      // [수정] width, height 제약을 제거하여 호환성 높임
    },
    audio: false
  };

  video = createCapture(constraints);
  video.hide(); // HTML 요소는 숨김

  // [수정] 비디오 스트림이 실제로 들어오는지 체크하는 로직
  let videoLoadCheck = setInterval(() => {
    // readyState 2 이상이고, 너비가 0보다 커야 진짜 켜진 것임
    if (video.elt.readyState >= 2 && video.elt.videoWidth > 0) {
      isVideoReady = true;
      clearInterval(videoLoadCheck);
      console.log(`Camera Loaded: ${facingMode} (${video.elt.videoWidth}x${video.elt.videoHeight})`);
      
      // 카메라 전환 전에 인식이 켜져 있었다면 다시 켜기
      if (wasDetectingBeforeSwitch) {
        startObjectDetection();
        wasDetectingBeforeSwitch = false;
      }
    }
  }, 100);
}

// 카메라 자원 완전 해제
function stopVideo() {
    if (video) {
        if (video.elt.srcObject) {
            const tracks = video.elt.srcObject.getTracks();
            tracks.forEach(track => track.stop()); // 하드웨어 전원 끄기
        }
        video.remove();
        video = null;
    }
}

function createUI() {
  dataDisplay = select('#dataDisplay');
  dataDisplay.html("전송 대기 중...");

  // Camera Buttons
  flipButton = createButton("좌우 반전");
  flipButton.parent('camera-control-buttons');
  flipButton.addClass('start-button');
  flipButton.mousePressed(toggleFlip);

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
    "potted plant", "bed", "dining table", "toilet", "TV", "laptop", "mouse", "remote", "keyboard",
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
  startDetectionButton = createButton("사물 인식 시작");
  startDetectionButton.parent('object-control-buttons');
  startDetectionButton.addClass('start-button');
  startDetectionButton.mousePressed(() => {
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

function toggleFlip() {
  isFlipped = !isFlipped;
}

// [핵심 수정] 카메라 전환 시 딜레이(0.5초)를 줘서 충돌 방지
function switchCamera() {
  wasDetectingBeforeSwitch = isObjectDetectionActive;
  isObjectDetectionActive = false; // AI 멈춤
  
  stopVideo(); // 기존 카메라 끄기
  isVideoReady = false;
  
  facingMode = facingMode === "user" ? "environment" : "user";
  
  // 500ms(0.5초) 후 재시작 - 모바일 안정성 확보
  setTimeout(setupCamera, 500);
}

function startObjectDetection() {
  if (!isVideoReady) {
      console.warn("카메라가 아직 준비되지 않았습니다.");
      return;
  }
  isObjectDetectionActive = true;
  detector.detect(video, gotDetections); 
}

function stopObjectDetection() {
  isObjectDetectionActive = false;
  detections = []; 
}

function gotDetections(error, results) {
  if (error) {
    console.error(error);
    return;
  }
  detections = results;
  
  // 카메라가 준비된 상태에서만 재귀 호출 (0.1초 딜레이)
  if (isObjectDetectionActive && isVideoReady) {
    setTimeout(() => {
        detector.detect(video, gotDetections); 
    }, 100); 
  }
}

function draw() {
  background(0); // 로딩 중 검은 화면

  if (!isVideoReady || !video || video.width === 0) {
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(16);
    text("카메라 로딩 중...", width / 2, height / 2);
    return;
  }

  // [센터 크롭] 원본 비율 유지하며 1:1 캔버스에 꽉 채우기
  let vw = video.width;
  let vh = video.height;
  let minDim = min(vw, vh); 
  let sx = (vw - minDim) / 2;
  let sy = (vh - minDim) / 2;

  push();
  if (isFlipped) {
    translate(width, 0);
    scale(-1, 1);
  }
  // (소스, 캔버스x,y,w,h, 소스x,y,w,h)
  image(video, 0, 0, width, height, sx, sy, minDim, minDim);
  pop();

  if (isObjectDetectionActive && detections.length > 0) {
    let highestConfidenceObject = null;
    let detectedCount = 0; 

    detections.forEach((object) => {
      // 선택된 사물이고 & 정확도 기준 넘으면
      if (selectedObjects.includes(object.label) && object.confidence * 100 >= confidenceThreshold) {
        
        detectedCount++;

        // 가장 정확도 높은 놈 찾기
        if (!highestConfidenceObject || object.confidence > highestConfidenceObject.confidence) {
          highestConfidenceObject = object;
        }

        // --- 화면 좌표 보정 (크롭된 화면 기준) ---
        // object.x, y는 원본(video) 기준 좌표이므로 캔버스(400x400) 기준으로 변환 필요
        // 1. 원본에서의 상대 위치 비율 계산
        // 2. 캔버스 크기에 맞춰 매핑
        
        // 간단한 시각화를 위해 여기서는 rect를 그림 (정확한 매핑은 복잡하므로 근사치)
        // 원본 영상에서 크롭된 영역(sx, sy, minDim, minDim) 안에 있는 것만 표시
        
        let objX = object.x - sx; // 크롭 시작점 뺌
        let objY = object.y - sy;
        
        // 크롭 영역 밖이면 스킵 (화면에 안보임)
        if (objX + object.width < 0 || objX > minDim || objY + object.height < 0 || objY > minDim) return;

        // 비율 변환 (원본 크롭 영역 -> 캔버스 400px)
        let scale = width / minDim;
        
        let drawX = objX * scale;
        let drawY = objY * scale;
        let drawW = object.width * scale;
        let drawH = object.height * scale;

        // 좌우 반전 처리
        if (isFlipped) {
            drawX = width - drawX - drawW;
        }

        // 그리기
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

    // 데이터 전송
    if (highestConfidenceObject) {
        let obj = highestConfidenceObject;
        
        // 전송할 좌표도 캔버스(0~400) 기준으로 변환해서 보냄
        // 그래야 로봇이 화면 중앙(200, 200)을 기준으로 판단 가능
        let objX = obj.x - sx;
        let objY = obj.y - sy;
        let scale = width / minDim;
        
        let finalX = objX * scale;
        let finalY = objY * scale;
        let finalW = obj.width * scale;
        let finalH = obj.height * scale;

        let centerX = finalX + finalW / 2;
        let centerY = finalY + finalH / 2;

        if (isFlipped) {
            centerX = width - centerX;
        }
        
        // 파란색 박스 (타겟)
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

/* --- Bluetooth Logic --- */

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
