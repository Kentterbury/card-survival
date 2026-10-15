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
   - Name: `ASSET_TOKEN`, Value: 위 토큰
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

- **캐릭터** (`export_char.py ... ALL`)
  - 팩마다 GLB 하나로 내보냅니다(`characters/Pack_<팩>.glb`). 모든 캐릭터가 같은 49본 리그(센티미터 단위)를 씁니다.
    - Knights: 기사 3, 병사 2
    - Fantasy Kingdom: 병사, 기수, 사형집행인, 사제, 수녀, 수도사, 마법사, 은자, 요정 등 22
    - Dungeon: 영웅 기사(남·여), 해골 4종, 고통받는 영혼, 유령 2, 고블린
    - Fantasy Characters: 마법사, 소서러, 마녀, 도적, 드루이드, 집시, 음유시인, 왕 등
  - 같은 UV를 쓰는 색상 아틀라스 27종은 `textures/`에 저장합니다. Knights 4색, Dungeon 4색, Kingdom 4종, Fantasy 15종입니다.
    - Fantasy와 Dungeon 아틀라스는 색 칸이 작아서 1024px로 둡니다. 나머지는 512px입니다(`TEX_SIZE`).
  - Fantasy Characters 팩은 원본 노멀이 뒤죽박죽이라 빛을 받으면 삼각형이 군데군데 어두워집니다. 그래서 내보낼 때 노멀을 바깥쪽으로 정리하고 평면 셰이딩으로 다시 계산합니다(`FIX_NORMALS=1`).
  - 무기 33종은 `weapons/`에 있습니다(검, 대검, 도끼, 철퇴, 창, 지팡이, 홀, 활, 석궁, 깃발, 방패).
  - 게임은 카드마다 「룩」을 하나씩 고릅니다: 팩, 캐릭터 메시, 색상 텍스처, 오른손·왼손 무기, 크기. 정의는 `syntySet.ts`의 `LOOKS`에 있습니다.
    - 카드 id, `hero:<영웅 id>`, `boss:<지휘관 이름>`을 키로 씁니다.
    - 그래서 카드·영웅·지휘관이 모두 다르게 보이고, 카드 초상화도 카드마다 따로 그립니다.
- **애니메이션** (`retarget.py`)
  - DoubleL RPG 애니메이션(Unity 휴머노이드 리그, A-포즈)을 Synty 리그로 월드 공간 리타깃합니다.
  - 뼈마다 기준 방향 차이를 보정합니다.
  - 제자리 동작으로 만든 뒤 `characters/anims.glb` 하나에 클립으로 모읍니다.
  - 소환 클립은 없어서, 해골은 코드로 바닥에서 솟아오릅니다.
  - 사망 클립은 Mixamo에서 받아 넣습니다(아래). 클립이 없는 동안에는 지금 자세 그대로 뒤로 넘어집니다.
- **배경·소품** (`export_static.py`)
  - Polygon Dungeon과 Fantasy Kingdom에서 가져옵니다.
  - 변환을 적용하고 메시를 하나로 합칩니다.
  - 게임에서는 원래 KayKit 조각의 경계 상자에 맞춰 크기를 조정합니다. 그래서 보드 배치 코드는 그대로입니다.
- **무기**: 손 뼈(`Hand_R` / `Hand_L`)에 붙입니다. 각도는 `SYNTY_CHARACTERS`에서 조정합니다.
- **압축** (`tools/optimize-synty.mjs`): GLB에 dedup, resample, prune, meshopt를 적용하고 텍스처는 그대로 복사합니다. 35MB가 15MB로 줄어듭니다.

### 매핑 바꾸기

- 카드의 생김새(캐릭터·색·무기·크기)는 `syntySet.ts`의 `LOOKS`만 고치면 됩니다. 이미 내보낸 팩·텍스처·무기 안에서 고를 때는 다시 변환할 필요가 없습니다.
- 새 무기나 클립을 추가하려면 `build_card_survival.sh`를 고친 뒤 위 1~3단계를 다시 실행합니다.
- 배경 조각을 바꾸려면 `syntySet.ts`의 `SYNTY_STATICS`도 함께 고칩니다.
- 결과물(`WebExport/card-survival/synty/`)은 `cardproject`에 커밋하고 푸시합니다. 그다음 card-survival 배포를 다시 실행하면 반영됩니다.

## Mixamo 사망 동작 넣기

보유한 팩에는 사망 애니메이션이 없어서 Mixamo(무료, Adobe 로그인 필요) 동작을 씁니다. 리타깃 스크립트가 Mixamo 리그(`mixamorig:*`)를 자동으로 인식합니다.

1. https://www.mixamo.com 에서 아래 동작을 검색합니다. 캐릭터는 기본 Y Bot 그대로 둡니다.
2. **Download** 설정:
   - Format: **FBX Binary (.fbx)**
   - Skin: **Without Skin**
   - Frames per second: **30**
   - Keyframe Reduction: **none**
   - Pose: **T-pose** (Synty 리그도 T자라서 보정이 가장 적습니다)
3. Mixamo 이름 그대로(예: `Sword And Shield Death.fbx`) 또는 아래 표의 파일 이름으로 `cardproject`의 `Assets/Mixamo/`에 넣습니다.
4. `build_card_survival.sh`부터 다시 실행합니다. 없는 파일은 건너뜁니다.
   - `Death_Back`이 없으면 기본 유닛은 `Death_Caster`(Dying Backwards)를 씁니다. 둘 다 없으면 코드로 넘어집니다.
   - 사망 클립은 엉덩이 이동의 60%를 남기고(뒤로 넘어지기, 앞으로 고꾸라지기), 게임에서는 길이와 상관없이 약 1.6초에 맞춰 재생합니다.

현재 들어 있는 동작: Sword And Shield Death, Two Handed Sword Death, Falling Forward Death, Death From Front Headshot, Dying, Dying Backwards, Zombie Dying (Falling Back Death는 아직 없음).

| 파일 이름 | Mixamo 검색어 | 쓰는 카드 |
| --- | --- | --- |
| `Death_Back.fbx` | Falling Back Death | 기본(아래 목록에 없는 모든 유닛) |
| `Death_Shield.fbx` | Sword And Shield Death | 수비대장, 방패병, 성채 기사, 방벽 수호자 등 방패 든 유닛, 해골 방패수, 해골 하사 |
| `Death_Heavy.fbx` | Two Handed Sword Death | 전쟁 족장, 대검 용병, 전쟁 군주, 근위 기사단장, 뼈 거인, 죽음의 기사 |
| `Death_Forward.fbx` | Falling Forward Death | 그림자 단검수, 돌격 기병, 광전사, 해골 추적자·암살자 |
| `Death_Shot.fbx` | Death From Front Headshot | 척후대장, 석궁병, 장궁수, 매복 척후병, 척후 저격수 |
| `Death_Kneel.fbx` | Dying | 비전술사, 견습 마법사, 의무병, 신관, 수도사, 학자 |
| `Death_Caster.fbx` | Dying Backwards | 대마법사, 공성 마법사, 해골 주술사들, 서고의 주술사, 해골 군주 |
| `Death_Undead.fbx` | Zombie Dying | 해골 졸개, 불사 해골, 되살아나는 해골, 해골 전사·대장 등 |

매핑은 `syntySet.ts`의 `DEATHS`에서 바꿀 수 있습니다.
