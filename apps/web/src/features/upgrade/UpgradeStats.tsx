import type { Card } from '@pitch/shared';
import { statsFor } from '../../components/card/rarity';
import type { UpgradePreview } from './upgrade';

/** Bảng chỉ số trước → sau khi ép (PRD F10: UI hiển thị chỉ số sau khi ép). */
export function UpgradeStats({ card, preview }: { card: Card; preview: UpgradePreview }) {
  const rows = [
    { key: 'ovr', abbr: 'OVR', name: 'Chỉ số tổng', from: preview.ovrBefore, to: preview.ovrAfter },
    ...statsFor(card.position).map((s) => ({
      key: s.key,
      abbr: s.abbr,
      name: s.name,
      from: preview.before[s.key],
      to: preview.after[s.key],
    })),
  ];
  return (
    <table className="upg-stats">
      <caption className="sr-only">
        Chỉ số ở +{preview.toLevel - 1} và sau khi ép lên +{preview.toLevel}
      </caption>
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">Chỉ số</span>
          </th>
          <th scope="col">+{preview.toLevel - 1}</th>
          <th scope="col" aria-hidden="true" />
          <th scope="col">+{preview.toLevel}</th>
          <th scope="col">
            <span className="sr-only">Tăng</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className={r.key === 'ovr' ? 'upg-stats__ovr' : undefined}>
            <th scope="row" title={r.name}>
              {r.abbr}
            </th>
            <td>{r.from}</td>
            <td aria-hidden="true">→</td>
            <td className="upg-stats__to">{r.to}</td>
            <td className="upg-stats__delta">{r.to > r.from ? `+${r.to - r.from}` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
