# Synty 에셋 (비공개)

게임은 두 가지 3D 에셋 세트를 지원합니다.

| 세트 | 위치 | 라이선스 | 언제 쓰나 |
| --- | --- | --- | --- |
| KayKit | `public/assets/` (이 저장소) | CC0 | 기본값. Synty 세트가 없을 때 |
| Synty POLYGON | `public/synty/` (커밋 안 함) | 유료 (Synty EULA) | `public/synty/manifest.json`이 있으면 자동 사용 |

시작할 때 `synty/manifest.json`(`{"version": 1}`)을 먼저 확인합니다. 파일이 있으면 Synty 모델을 읽고, 없으면 지금까지처럼 KayKit을 씁니다. 매핑은 모두 [`src/render/syntySet.ts`](../src/render/syntySet.ts)에 있습니다.

## 저장소 구성

- **원본과 변환본**은 비공개 저장소 `Kentterbury/cardproject`에 있습니다.
  - 원본: `Assets/` (Unity 프로젝트)
  - 변환 도구: `WebExport/tools/`
  - 웹용 결과물: `WebExport/card-survival/synty/`
- **이 공개 저장소에는 Synty 파일을 커밋하지 않습니다.** `public/synty/`는 `.gitignore`에 들어 있습니다.
- GitHub Pages 배포(`.github/workflows/pages.yml`)는 빌드 직전에 읽기 전용 토큰으로 `cardproject`의 `WebExport/card-survival/synty`만 받아 `public/synty/`에 복사합니다.
  - 토큰이 없으면 이 단계를 건너뛰고 KayKit으로 배포합니다.

> 배포된 게임은 웹에서 GLB 파일을 내려받아 표시합니다. 그래서 변환된 저해상도 모델(512px 텍스처, 압축 메시)은 게임 일부로 공개 URL에 올라갑니다. 원본 FBX와 텍스처는 비공개 저장소에만 있습니다. 공개 배포가 Synty 라이선스 조건에 맞는지는 직접 확인하세요.

## 배포 토큰 설정 (한 번만)

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token
   - Repository access: **Only select repositories** → `Kentterbury/cardproject`
   - Permissions → Repository permissions → **Contents: Read-only**
2. `Kentterbury/card-survival` → Settings → Secrets and variables → Actions → **New repository secret**
   - Name: `SYNTY_ASSETS_TOKEN`, Value: 위 토큰
3. (선택) 에셋을 `cardproject`의 다른 브랜치(예: `main`)에서 받으려면 같은 화면의 **Variables** 탭에 `SYNTY_ASSETS_REF`를 추가합니다.
   - 기본값은 `claude/charming-darwin-ijym46`입니다.
4. Actions → Deploy to GitHub Pages → **Run workflow**로 다시 배포합니다.

## 변환 파이프라인

Blender 앱 없이 PyPI의 `bpy` 모듈로 FBX를 변환합니다.

```bash
# Python 3.13 가상환경에 bpy 설치 (최초 1회)
python3.13 -m venv ~/bpyenv && ~/bpyenv/bin/pip install bpy==5.2.2

# 1) cardproject에서 FBX → GLB (약 30초) → WebExport/card-survival/assets-raw/
cd cardproject
BLENDER_PY=~/bpyenv/bin/python WebExport/tools/build_card_survival.sh

# 2) card-survival에서 압축 + manifest.json 생성 → cardproject/WebExport/card-survival/synty/
cd ../card-survival
npm run synty -- ../cardproject/WebExport/card-survival/assets-raw ../cardproject/WebExport/card-survival/synty

# 3) 로컬 확인용 복사 (커밋되지 않음)
rm -rf public/synty && cp -r ../cardproject/WebExport/card-survival/synty public/synty
```

### 단계별 처리

- **캐릭터** (`export_char.py`)
  - 여러 캐릭터가 들어 있는 팩 FBX에서 필요한 메시만 남깁니다.
  - 리그는 Synty 공용 49본 리그(센티미터 단위)를 그대로 씁니다. 게임에서 `SYNTY_CHAR_SCALE`로 줄입니다.
  - 텍스처 아틀라스는 512px로 줄입니다.
- **애니메이션** (`retarget.py`)
  - DoubleL RPG 애니메이션(Unity 휴머노이드 리그, A-포즈)을 Synty 리그로 월드 공간 리타깃합니다.
  - 뼈마다 기준 방향 차이를 보정합니다.
  - 제자리 동작으로 만든 뒤 `characters/anims.glb` 하나에 클립으로 모읍니다.
  - 사망·소환 클립은 없어서, 게임 코드가 대신 연출합니다.
    - 사망: 뒤로 넘어짐
    - 해골 소환: 바닥에서 솟아오름
- **배경·소품** (`export_static.py`)
  - Polygon Dungeon과 Fantasy Kingdom에서 가져옵니다.
  - 변환을 적용하고 메시를 하나로 합칩니다.
  - 게임에서는 원래 KayKit 조각의 경계 상자에 맞춰 크기를 조정합니다. 그래서 보드 배치 코드는 그대로입니다.
- **무기**: 손 뼈(`Hand_R` / `Hand_L`)에 붙입니다. 각도는 `SYNTY_CHARACTERS`에서 조정합니다.
- **압축** (`tools/optimize-synty.mjs`): dedup, resample, prune, meshopt를 적용합니다. 9.0MB가 4.4MB로 줄어듭니다.

### 매핑 바꾸기

- 캐릭터나 클립을 바꾸려면 `build_card_survival.sh`를 고친 뒤 위 1~3단계를 다시 실행합니다.
- 배경 조각을 바꾸려면 `syntySet.ts`의 `SYNTY_STATICS`도 함께 고칩니다.
- 결과물(`WebExport/card-survival/synty/`)은 `cardproject`에 커밋하고 푸시합니다. 그다음 card-survival 배포를 다시 실행하면 반영됩니다.
