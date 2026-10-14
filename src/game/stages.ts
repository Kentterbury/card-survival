/**
 * Fixed stage scripts. Each entry in `waves` is what appears at the far end of
 * the hall at the end of that enemy turn (index 0 = before the first player turn).
 * A spawn is `monsterId` (random lane) or `monsterId@lane`.
 */
export interface StageDef {
  name: string;
  subtitle: string;
  waves: string[][];
}

export const STAGES: StageDef[] = [
  {
    name: '무너진 성문', subtitle: '첫 번째 방어선',
    waves: [
      ['minion@2'], [], ['minion', 'minion'], [], ['minion', 'rogue'], [], ['minion', 'minion', 'minion'], [], ['warrior@2'],
    ],
  },
  {
    name: '횃불의 회랑', subtitle: '속도가 빠른 추적자들',
    waves: [
      ['minion', 'minion'], ['rogue'], [], ['minion', 'rogue', 'minion'], ['warrior'], [], ['rogue', 'rogue'], ['minion', 'minion'], [], ['warrior', 'warrior'],
    ],
  },
  {
    name: '주술사의 서고', subtitle: '멀리서 날아오는 저주',
    waves: [
      ['minion', 'mage'], [], ['warrior', 'minion'], ['mage'], ['rogue', 'rogue'], [], ['mage', 'warrior', 'minion'], ['minion', 'minion'], [], ['guard@2', 'mage'], ['rogue', 'rogue'],
    ],
  },
  {
    name: '뼈의 납골당', subtitle: '거대한 것이 깨어난다',
    waves: [
      ['guard', 'minion', 'minion'], [], ['mage', 'rogue'], ['warrior', 'warrior'], [], ['brute@2'], ['minion', 'minion', 'minion'], ['mage', 'mage'], [], ['rogue', 'rogue', 'guard'], [], ['brute@1', 'brute@3'],
    ],
  },
  {
    name: '군주의 왕좌', subtitle: '최종 결전',
    waves: [
      ['lich@2', 'minion@0', 'minion@4'], [], ['warrior', 'mage'], [], ['guard', 'rogue'], [], ['brute'], [], ['mage', 'mage'],
    ],
  },
];
