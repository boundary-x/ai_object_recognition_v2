/**
 * sketch.js
 * Boundary X Object Detection (Multi-Select & High Response)
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

// [최적화] 전송 속도 0.1초(100ms)로 변경 (반응성 향상)
let lastSentTime = 0; 
const SEND_INTERVAL = 100; 

// Video and ML variables
let video;
let detector;
let detections = [];

// [다중 선택] 선택된 사물들을 저장할 배열
let selectedObjects = []; 

let confidenceThreshold = 50; 
let isObjectDetectionActive = false; 

// Camera control variables
let facingMode = "user"; 
let isFlipped = false;  

// UI elements
let flipButton, switchCameraButton, connectBluetoothButton, disconnectBluetoothButton;
let startDetectionButton, stopDetectionButton;
let objectSelect, confidenceSlider;
let confidenceLabel;
let dataDisplay;
let selectedObjectsListDiv; // 태그 표시 영역

function preload() {
  detector = ml5.objectDetector("cocossd");
}

function setup() {
  let canvas = createCanvas(400, 300);
  canvas.parent('p5-container');
  canvas.style('border-radius', '16px');
  
  setupCamera();
  createUI();
}

function setupCamera() {
  let constraints = {
    video: {
      facingMode: facingMode
    },
    audio: false
  };

  video = createCapture(constraints);
  video.size(400, 300);
  video.hide();
}

function stopVideo() {
    if (video) {
        if (video.elt.srcObject) {
            video.elt.srcObject.getTracks().forEach(track => track.stop());
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

  // Object Selection Dropdown
  objectSelect = createSelect();
  objectSelect.parent('object-select-container');
  objectSelect.option("사물을 선택하세요", ""); // 기본값
  
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
  
  // [다중 선택 로직] 선택 시 리스트에 추가
  objectSelect.changed(() => {
      const val = objectSelect.value();
      if(val && !selectedObjects.includes(val)) {
          addSelectedObject(val);
      }
      objectSelect.value(""); // 선택 후 드롭다운 초기화
  });

  selectedObjectsListDiv = select('#selected-objects-list');

  // Confidence Slider
  confidenceSlider = createSlider(0, 100, 50);
  confidenceSlider.parent('confidence-container');
  confidenceSlider.input(() => {
    confidenceThreshold = confidenceSlider.value();
    if(confidenceLabel) confidenceLabel.html(`정확도 기준: ${confidenceThreshold}%`);
  });

  confidenceLabel = createDiv(`정확도 기준: ${confidenceThreshold}%`);
  confidenceLabel.parent('confidence-container');
  confidenceLabel.style('font-size', '0.9rem').style('color', '#666');

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

// [다중 선택] 사물 추가 함수
function addSelectedObject(objName) {
    selectedObjects.push(objName);
    renderSelectedObjects();
}

// [다중 선택] 사물 삭제 함수
function removeSelectedObject(objName) {
    selectedObjects = selectedObjects.filter(item => item !== objName);
    renderSelectedObjects();
}

// [다중 선택] 리스트 렌더링 (태그 표시)
function renderSelectedObjects() {
    selectedObjectsListDiv.html(''); // 초기화
    
    selectedObjects.forEach(obj => {
        const tag = createDiv();
        tag.addClass('tag-item');
        tag.html(`${obj} <span class="tag-remove">&times;</span>`);
        tag.parent(selectedObjectsListDiv);
        
        // 삭제 버튼 이벤트
        tag.mouseClicked(() => removeSelectedObject(obj));
    });
}

function toggleFlip() {
  isFlipped = !isFlipped;
}

function switchCamera() {
  stopVideo();
  facingMode = facingMode === "user" ? "environment" : "user";
  setTimeout(setupCamera, 200);
}

function startObjectDetection() {
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
  
  // 0.1초 휴식 후 재호출 (발열 방지)
  if (isObjectDetectionActive) {
    setTimeout(() => {
        detector.detect(video, gotDetections); 
    }, 100); 
  }
}

function draw() {
  background(0);

  if (isFlipped) {
    push();
    translate(width, 0);
    scale(-1, 1);
    image(video, 0, 0, width, height);
    pop();
  } else {
    image(video, 0, 0, width, height);
  }

  if (isObjectDetectionActive && detections.length > 0) {
    let highestConfidenceObject = null;
    let detectedCount = 0; 

    // 1. 선택된 사물 리스트에 포함된 것들만 필터링
    detections.forEach((object) => {
      // 배열에 포함되어 있고, 정확도가 기준 이상인 경우
      if (selectedObjects.includes(object.label) && object.confidence * 100 >= confidenceThreshold) {
        
        // 전체 개수 카운트 (d값)
        detectedCount++;

        // 가장 정확도 높은 1개 찾기 (전송 기준)
        if (!highestConfidenceObject || object.confidence > highestConfidenceObject.confidence) {
          highestConfidenceObject = object;
        }

        // --- 화면 그리기 (모든 감지된 사물) ---
        let x = isFlipped ? width - object.x - object.width : object.x;
        let y = object.y;
        let w = object.width;
        let h = object.height;

        stroke(0, 255, 0); // 기본 초록색
        strokeWeight(2);
        noFill();
        rect(x, y, w, h);

        noStroke();
        fill(255);
        textSize(16);
        text(
          `${object.label} ${(object.confidence * 100).toFixed(0)}%`,
          x + 5,
          y > 20 ? y - 5 : y + 20
        );
      }
    });

    // 2. 가장 정확한 사물 강조 및 데이터 전송
    if (highestConfidenceObject) {
        let obj = highestConfidenceObject;
        
        // 강조 표시 (파란색)
        let bx = isFlipped ? width - obj.x - obj.width : obj.x;
        stroke(0, 100, 255);
        strokeWeight(4);
        noFill();
        rect(bx, obj.y, obj.width, obj.height);
        
        // 좌표 계산
        let centerX = isFlipped ? width - (obj.x + obj.width / 2) : obj.x + obj.width / 2;
        let centerY = obj.y + obj.height / 2;
        
        // [반응성 최우선] 0.1초마다 전송
        let currentTime = millis();
        if (currentTime - lastSentTime > SEND_INTERVAL) {
            // detectedCount는 선택된 사물들의 총합
            sendBluetoothData(centerX, centerY, obj.width, obj.height, detectedCount);
            lastSentTime = currentTime;
            
            const dataStr = `x${Math.round(centerX)} y${Math.round(centerY)} w${Math.round(obj.width)} h${Math.round(obj.height)} d${detectedCount}`;
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
