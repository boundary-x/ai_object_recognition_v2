/* Object-recognition help. Tours never operate camera, detection, or BLE controls. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const support = $('support-card');
support.innerHTML = `
<summary><span><strong>사용 가이드 및 지원</strong><small>사용법 · 예제 코드 · 문제 해결</small></span><span class="support-chevron" aria-hidden="true">⌄</span></summary>
<div class="support-content">
<p class="support-intro">사물을 선택하고 위치·크기 데이터를 프로젝트에 활용해보세요.</p>
<div class="support-actions"><button type="button" data-tour="all" class="support-primary">사용법 둘러보기 <span aria-hidden="true">→</span></button></div>
<details class="support-section" id="help-examples"><summary>마이크로비트 예제 코드</summary><div class="support-answer example-codes">
<div class="example-code"><a href="https://makecode.microbit.org/S49771-77509-50114-72682" target="_blank" rel="noopener noreferrer">블루투스 이름 확인 코드 ↗</a><p>연결할 마이크로비트의 장치 이름을 확인합니다. 마이크로비트의 LED 매트릭스에 출력되는 이름(알파벳 소문자 5자리)을 확인한 뒤 아래 프로젝트 코드를 다운로드하세요.</p></div>
<div class="example-code"><a id="project-example-link" href="https://makecode.microbit.org/S32368-56120-50992-39988" target="_blank" rel="noopener noreferrer">프로젝트 예제 · 사물인식 데이터 수신 ↗</a><p>중심 좌표 x·y, 너비 w, 높이 h, 감지 수 d를 읽어 프로젝트에 활용하는 예제입니다.</p></div>
<div class="example-code"><a href="https://makecode.microbit.org/#pub:11066-23811-50503-78222" target="_blank" rel="noopener noreferrer">프로젝트 예제 · AI 포니봇 대상추종로봇 ↗</a><p>선택한 대상을 따라 움직이는 AI 포니봇 연동 예제입니다.</p></div>
<p class="support-caption">현재 앱의 정지 신호는 stop입니다. 예제에서도 stop 수신 시 정지하도록 설정하세요. 다운로드하면 마이크로비트의 이전 코드가 교체됩니다.</p>
</div></details>
<details class="support-section" id="help-troubleshooting"><summary>문제 해결 <span class="support-meta">증상별 안내</span></summary><div class="support-answer support-faq">
<details><summary>카메라나 모델이 준비되지 않아요</summary><p>카메라 권한을 허용하고 인터넷 연결을 확인하세요. 다른 앱이 카메라를 사용 중이면 종료하세요. 모델 로딩 후 시작 버튼이 ‘사물 인식 시작’으로 바뀝니다.</p></details>
<details><summary>사물 인식이 시작되지 않아요</summary><p>이 앱은 모델 로딩, 블루투스 연결, 인식할 사물 선택이 완료되어야 시작할 수 있습니다. 지원 목록에서 person, cup 등 필요한 사물을 추가하세요. 별도 ID 학습 기능은 없습니다.</p></details>
<details><summary>선택한 사물이 잘 인식되지 않아요</summary><p>밝은 곳에서 대상이 충분히 크게 보이게 촬영하세요. 정확도 기준을 낮추면 더 많은 결과를 표시하지만 잘못 인식할 가능성도 커집니다. 현재 모델은 30% 미만 결과를 먼저 제외하므로 슬라이더를 그 아래로 낮춰도 해당 결과가 나타나지는 않습니다.</p></details>
<details><summary>화면이 느리거나 GPU 실행이 불안정해요</summary><p>AI 연산 장치 설정에서 CPU를 시도해보세요. 전환 시 모델을 다시 불러오며, 진행 중이던 인식은 전환 후 재개됩니다. 어느 모드가 빠른지는 기기에 따라 다릅니다.</p></details>
<details id="help-connection"><summary>블루투스가 연결되지 않거나 기기가 움직이지 않아요</summary><p>마이크로비트 전원과 예제 코드 다운로드 여부를 확인하세요. MakeCode 프로젝트의 블루투스 페어링 설정과 브라우저의 Web Bluetooth 지원 여부를 확인하고, 다른 앱과 연결되어 있다면 해제하세요.</p><p>기기 코드는 x·y·w·h·d와 stop을 읽어야 합니다. 화면의 데이터 표시만으로 수신 성공을 확인할 수는 없으므로 연결 상태와 기기의 반응도 함께 확인하세요.</p></details>
<details><summary>여러 사물이 보이는데 좌표는 하나만 나와요</summary><p>선택한 종류와 정확도 기준을 통과한 사물 중 신뢰도가 가장 높은 하나의 좌표·크기를 전송합니다. 해당 대상은 파란색, 나머지는 초록색으로 표시됩니다. d는 조건을 통과한 사물의 총 개수입니다.</p></details>
<details><summary>데이터 형식과 정지 신호는 무엇인가요?</summary><p>예: x200y150w80h60d2. x·y는 400×300 캔버스 기준 중심 좌표, w·h는 너비·높이, d는 조건을 통과한 감지 수입니다. 표시 화면의 CSS 크기가 달라도 좌표 기준은 같습니다.</p><p>대상이 없거나 인식을 중지하면 stop을 보냅니다. 연결이 끊어지면 앱의 인식도 중지되지만 끊어진 연결로 정지 명령을 보낼 수는 없습니다.</p></details>
</div></details>
<details class="support-section" id="help-updates"><summary>업데이트 노트 <span class="support-meta">최근 변경</span></summary><div class="support-answer"><p class="support-release">사용 가이드 및 지원 추가</p><ul><li>사물 설정·기기 연결·데이터 확인을 통합한 화면 안내</li><li>예제 코드와 문제 해결을 앱 안에서 확인</li></ul><p class="support-release">최근 개선</p><ul><li>MediaPipe JavaScript·WASM 1.0.1 적용</li><li>라벨 글꼴 측정·정렬 및 화면 가장자리 표시 수정</li><li>수정된 스크립트를 불러오도록 파일 버전 지정</li></ul></div></details>
<a class="support-original" href="https://boundaryx.io/ai/?bmode=view&idx=163120313" target="_blank" rel="noopener noreferrer">개념 설명 · 프로젝트 아이디어 보기 ↗</a>
</div>`;
const recognition=[
['#p5-container','카메라와 모델을 준비하세요','카메라 권한을 허용하고 AI 모델 로딩을 기다리세요. 이미 학습된 사물 목록에서 대상을 고르므로 별도 학습은 필요하지 않습니다.'],
['#camera-control-buttons','촬영할 카메라를 선택하세요','전후방 전환으로 사용할 카메라를 선택하세요. 전방 카메라는 거울 모드이며 전송 중심 좌표도 표시 방향에 맞춰집니다.'],
['#object-select-container','인식할 사물을 선택하세요','목록에서 person, cup 등 대상을 선택하면 아래에 추가됩니다. 여러 종류를 선택할 수 있고 ×로 제거할 수 있습니다.'],
['#confidence-container','정확도 기준을 조절하세요','기본값은 50%입니다. 높이면 확신이 높은 결과만 남고, 낮추면 결과가 늘지만 오인식도 늘 수 있습니다. 모델 자체는 30% 미만 결과를 제외합니다.']
];
const device=[
['#project-example-link','마이크로비트 예제를 준비하세요','이름 확인 코드로 장치를 확인한 뒤 데이터 수신 예제 또는 AI 포니봇 예제를 다운로드하세요. 현재 정지 문자열은 stop입니다.'],
['#bluetooth-control-buttons','마이크로비트를 연결하세요','기기 연결에서 내 장치를 선택하세요. 실제 인식을 시작하려면 블루투스 연결이 필요합니다. 안내만 둘러보는 동안은 연결하지 않아도 됩니다.'],
['#object-control-buttons','사물 인식을 시작하세요','모델 로딩과 기기 연결, 사물 선택을 마친 뒤 ‘사물 인식 시작’을 누르세요. 선택한 종류 중 정확도 기준을 통과한 사물을 표시합니다.'],
['#object-control-buttons','작업을 마치면 인식을 중지하세요','인식 중지를 누르면 stop 전송을 시도합니다. 선택한 대상이 감지되지 않을 때도 stop을 보냅니다. 기기 코드에서 이를 받아 정지하도록 설정하세요.']
];
const data=[
['#p5-container','파란색과 초록색 박스를 구분하세요','조건을 통과한 사물 중 신뢰도가 가장 높은 대상은 파란색입니다. 나머지는 초록색으로 표시하며 파란색 대상의 중심 좌표와 크기를 전송합니다.'],
['#dataDisplay','전송할 좌표와 개수를 읽으세요','x·y는 중심 좌표, w·h는 너비·높이, d는 조건을 통과한 감지 수입니다. 예: x200y150w80h60d2. 데이터 표시와 함께 연결 상태도 확인하세요.'],
['#delegate-settings','GPU 또는 CPU를 선택하세요','GPU/CPU 전환 시 모델을 다시 불러옵니다. 인식 중 전환했다면 완료 후 인식이 재개됩니다. 느리거나 불안정하면 다른 모드를 시험해보세요.']
];
const allSteps=[...recognition,...device,...data];
const chapters=[{label:'사물 설정',start:0},{label:'기기 연결',start:recognition.length},{label:'데이터·성능',start:recognition.length+device.length}];
  const dialog = document.createElement('dialog');
  dialog.id = 'guide-dialog';
  dialog.setAttribute('aria-labelledby', 'guide-title');
  dialog.setAttribute('aria-describedby', 'guide-description');
  dialog.innerHTML = `<div id="guide-spotlight" aria-hidden="true"></div><section id="guide-panel"><div class="guide-topline"><span id="guide-progress"></span><button id="guide-close" type="button" aria-label="화면 안내 종료">닫기 ×</button></div><nav class="guide-chapters" aria-label="안내 구간">${chapters.map((chapter, i) => `<button type="button" data-chapter="${i}" aria-pressed="false">${chapter.label}</button>`).join('')}</nav><div aria-live="polite" aria-atomic="true"><h2 id="guide-title"></h2><p id="guide-description"></p></div><p class="guide-caption">화면 안내입니다. 닫은 뒤 직접 눌러보세요.</p><button id="guide-skip-device" type="button" hidden>기기 연결 건너뛰기 →</button><div class="guide-navigation"><button id="guide-prev" type="button">이전</button><button id="guide-next" type="button">다음</button></div></section>`;
  document.body.appendChild(dialog);
  let steps = [], index = 0, target = null, opener = null, originalScroll = 0, pendingFrame = 0;

  let examplesWereOpen = false;

  function openHelp(section) {
    support.open = true;
    if (section) {
      $('help-troubleshooting').open = true;
      $(section).open = true;
    }
    const heading = (section ? $(section) : support).querySelector('summary');
    heading.scrollIntoView({block: 'center', behavior: 'instant'});
    heading.focus({preventScroll: true});
  }
  document.querySelectorAll('[data-help]').forEach(button => button.addEventListener('click', () => openHelp(button.dataset.help || null)));

  function renderStep() {
    const [selector, title, description] = steps[index];
    if (selector === '#project-example-link') $('help-examples').open = true;
    target = document.querySelector(selector);
    const chapterIndex = index < chapters[1].start ? 0 : index < chapters[2].start ? 1 : 2;
    dialog.querySelectorAll('[data-chapter]').forEach((button, i) => button.setAttribute('aria-pressed', String(i === chapterIndex)));
    $('guide-skip-device').hidden = chapterIndex !== 1;
    $('guide-progress').textContent = `${chapters[chapterIndex].label}${chapterIndex === 1 ? ' · 선택' : ''} · ${index + 1} / ${steps.length}`;
    $('guide-title').textContent = title;
    $('guide-description').textContent = description;
    $('guide-prev').disabled = index === 0;
    $('guide-next').textContent = index === steps.length - 1 ? '안내 마치기' : '다음';
    if (target) target.scrollIntoView({block: 'center', behavior: 'instant'});
    positionGuide(true);
  }

  function positionGuide(reveal = false) {
    if (!dialog.open) return;
    const panel = $('guide-panel'), spot = $('guide-spotlight');
    const width = window.innerWidth, height = window.innerHeight, gap = 16;
    panel.style.width = Math.min(360, width - 24) + 'px';
    const ph = panel.getBoundingClientRect().height, pw = panel.getBoundingClientRect().width;
    const headerBottom = document.querySelector('header').getBoundingClientRect().bottom;
    let r = target ? target.getBoundingClientRect() : null;
    // Narrow screens reserve the lower area for the explanation. A temporary bottom
    // spacer allows the last control to scroll above it without altering saved data.
    const narrow = width < 700;
    if (reveal && r && narrow) {
      const top = Math.max(12, headerBottom + 16);
      window.scrollBy({top: r.top - top, behavior: 'instant'});
      r = target.getBoundingClientRect();
    }
    let x = width - pw - 12, y = height - ph - 12;
    if (r && !narrow) {
      const candidates = [
        [r.left - pw - gap, Math.max(12, Math.min(r.top, height - ph - 12))],
        [r.right + gap, Math.max(12, Math.min(r.top, height - ph - 12))],
        [Math.max(12, Math.min(r.left, width - pw - 12)), r.bottom + gap],
        [Math.max(12, Math.min(r.left, width - pw - 12)), r.top - ph - gap]
      ];
      const fit = candidates.find(([cx, cy]) => cx >= 12 && cy >= 12 && cx + pw <= width - 12 && cy + ph <= height - 12);
      if (fit) [x,y] = fit;
    }
    panel.style.left = x + 'px'; panel.style.top = Math.max(12, y) + 'px';
    if (r) {
      const top = Math.max(4, r.top - 5), left = Math.max(4, r.left - 5);
      const bottom = Math.min(height - 4, narrow ? y - 12 : height - 4, r.bottom + 5);
      spot.hidden = bottom <= top || r.right <= 0 || r.left >= width;
      Object.assign(spot.style, {left: left + 'px', top: top + 'px', width: Math.max(0, Math.min(width - 4, r.right + 5) - left) + 'px', height: Math.max(0, bottom - top) + 'px'});
    } else spot.hidden = true;
  }
  function startTour(kind, button) {
    if (kind !== 'all') return;
    opener = button; originalScroll = window.scrollY;
    steps = allSteps; index = 0;
    examplesWereOpen = $('help-examples').open;
    document.body.classList.add('guide-active');
    dialog.showModal();
    renderStep();
    $('guide-next').focus({preventScroll:true});
  }
  support.querySelectorAll('[data-tour]').forEach(button => button.addEventListener('click', () => startTour(button.dataset.tour, button)));
  $('guide-prev').addEventListener('click', () => { if (index > 0) { index--; renderStep(); } });
  $('guide-next').addEventListener('click', () => { if (index === steps.length - 1) dialog.close(); else { index++; renderStep(); } });
  dialog.querySelectorAll('[data-chapter]').forEach(button => button.addEventListener('click', () => { index = chapters[Number(button.dataset.chapter)].start; renderStep(); }));
  $('guide-skip-device').addEventListener('click', () => { index = chapters[2].start; renderStep(); $('guide-next').focus({preventScroll:true}); });
  $('guide-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.body.classList.remove('guide-active');
    $('help-examples').open = examplesWereOpen;
    window.scrollTo({top:originalScroll, behavior:'instant'});
    if (opener) opener.focus({preventScroll:true});
  });
  const reposition = () => {
    if (!dialog.open || pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => { pendingFrame = 0; positionGuide(); });
  };
  window.addEventListener('resize', () => { if (dialog.open) renderStep(); });
  window.addEventListener('scroll', reposition, {passive:true});
  if (location.hash === '#support-card') requestAnimationFrame(() => openHelp());
})();

