# otome-nai

Marinara Engine의 **오토메 하스(Otome Hearth, otome-forge)** 에서 NovelAI V5로 캐릭터 이미지를 그릴 때 쓰는 서버 패치입니다.
게임·엔진 파일은 건드리지 않고, `NODE_OPTIONS --require`로 불러오는 메모리 훅입니다.

## 무엇을 고치나

### 1. 외모 이미지: 진짜 투명 배경 (Transparent BG)
- 오토메 하스는 외모를 초록/마젠타/회색 단색 배경에 그린 뒤 엔진의 색 빼기로 오려 냅니다. 이때 배경색과 비슷한 피부·그림자·하이라이트까지 지워져 몸에 구멍이 납니다.
- V5 모델(`nai-diffusion-5`, `-full`, `-curated`)이면 그 배경 문구를 `transparent background`로 바꾸고, NovelAI 웹과 같은 `tag_hint_transparent_background: true`, `straight_alpha: true`를 켜서 처음부터 투명 PNG를 받습니다. 엔진은 이미 투명한 이미지를 그대로 두므로 구멍이 생기지 않습니다.

### 2. 표정 이미지: 서 있는 전신 + 투명 배경
- 오토메 하스는 표정을 "참조 이미지에서 표정만 바꿔 줘(자세·배경 유지)"라는 문장으로 요청합니다. 그런데 V5는 참조 이미지를 받지 못해서(엔진이 뺌), 자세도 배경도 없는 문장만 가서 **쭈그려 앉거나 흰 배경**으로 그려지고, 오려 내기에서 피부·붕대가 지워졌습니다.
- V5에서는 그 문장을 외모 프롬프트처럼 다시 짭니다: 외모 특징 + 의상 + 표정 + `full body, standing, neutral pose, arms at sides, front view, transparent background`.
- 네거티브에 `sitting, squatting, crouching, kneeling, lying, cropped legs, white background, simple background, floor, cast shadow`를 더합니다 (외모 이미지에도 같이).

### 3. 일회성 외모 교체 (선택)
- 패치 파일 옆에 `look-override/<캐릭터 이름>.png`를 두고 게임에서 그 캐릭터의 외모 **'다시 그리기'** 를 누르면, NovelAI 대신 그 그림이 들어갑니다(게임이 저장·오려 내기·연결까지 직접 처리).
- 한 번 쓰면 `<이름>.used-<시간>.png`로 이름이 바뀌어, 다음 다시 그리기는 평소처럼 그립니다. 표정에는 적용되지 않습니다.

### 안전장치
- `image.novelai.net/ai/generate-image` POST 중 위 조건에 맞는 것만 바꿉니다. 장면·장소·CG, 다른 앱, V4.5 모델은 그대로입니다.
- NovelAI가 바꾼 요청을 4xx로 거절하면(401/402/429 제외) 원래 요청을 그대로 다시 보냅니다.

## 설치
1. `otome-novelai-transparent.cjs`를 Marinara Engine 폴더 안 원하는 곳에 둡니다. 예: `Marinara-Engine/user-patches/otome-forge/`
2. Marinara Engine 폴더의 `.env`에서 `NODE_OPTIONS`에 한 줄을 더합니다 (경로는 실제 위치로, 슬래시 `/` 사용):
   ```
   NODE_OPTIONS=--require=C:/경로/Marinara-Engine/user-patches/otome-forge/otome-novelai-transparent.cjs
   ```
   이미 다른 `--require`가 있으면 같은 줄 끝에 공백으로 이어 붙입니다.
3. Marinara를 **런처로 완전히 껐다 켭니다.** (`start.bat`이 시작할 때 `.env`를 읽으므로, 앱 안 재시작만으로는 새 `NODE_OPTIONS`가 적용되지 않습니다.)
4. 서버 로그에 `[otome-novelai-transparent] preload loaded` 가 보이면 켜진 것입니다.
5. 이미 깨져서 저장된 이미지는 그대로입니다. 게임 설정 → 출연진에서 **'다시 그리기'** / **'표정 다시 그리기'** 를 눌러 새로 그리세요.

## 끄기
- `.env`에 `OTOME_NOVELAI_TRANSPARENT_OFF=1` 을 넣고 Marinara를 다시 켭니다. (또는 `NODE_OPTIONS`에서 그 줄을 지웁니다.)

## 한계
- V5 연결에서만 동작합니다. V5는 참조 이미지를 못 쓰므로 표정 그림이 외모 그림과 얼굴·옷 디테일까지 똑같지는 않습니다(프롬프트가 같아 비슷하게 나옵니다).

## 확인한 환경
- Marinara Engine 2.5.2, otome-forge 0.8.10, NovelAI `nai-diffusion-5-full`
