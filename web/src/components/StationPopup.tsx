import type { FuelType, StationDetail } from '../api';
import { formatPrice, isStale, timeAgoShort } from '../format';
import { navigateTo } from '../navigate';

/** "232 HIGH ST, WAUCHOPE NSW 2446" -> ["232 HIGH ST", "WAUCHOPE NSW 2446"] */
function splitAddress(address: string | null): [string, string] {
  if (!address) return ['', ''];
  const i = address.lastIndexOf(',');
  return i < 0 ? [address, ''] : [address.slice(0, i).trim(), address.slice(i + 1).trim()];
}

/** Popup content for a selected station, modelled on PetrolSpy's */
export function StationPopup({ station, fuel, fuelTypes, onClose }: {
  station: StationDetail;
  fuel: string;
  fuelTypes: FuelType[];
  onClose: () => void;
}) {
  const [street, locality] = splitAddress(station.address);
  const selected = station.prices.find((p) => p.fuelType === fuel);
  const others = station.prices.filter((p) => p.fuelType !== fuel);
  const fuelName = fuelTypes.find((f) => f.code === fuel)?.name ?? fuel;

  return (
    <div className="sp">
      <div className="sp-head">
        <div className="sp-name" title={station.name}>{station.name}</div>
        <button className="sp-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="sp-addr">
        {street && <div>{street}</div>}
        {locality && <div className="sp-locality">{locality}</div>}
      </div>

      <div className="sp-prices">
        {selected ? (
          <div className="sp-main">
            <span className="sp-fuel">{fuelName}</span>{' '}
            <span className="sp-price">{formatPrice(selected.price)}</span>{' '}
            <span className={isStale(selected.sourceUpdatedAt) ? 'stale' : 'sp-age'}>({timeAgoShort(selected.sourceUpdatedAt)})</span>
          </div>
        ) : (
          <div className="sp-main muted">No {fuelName} price</div>
        )}
        {others.length > 0 && (
          <div className="sp-others">
            {others.map((p, i) => (
              <span key={p.fuelType}>
                {i > 0 && ', '}
                {p.fuelType} <span className="sp-other-price">{formatPrice(p.price)}</span>
              </span>
            ))}
          </div>
        )}
        {station.attribution && (
          <div className="sp-by">
            by <a href={station.attribution.url} target="_blank" rel="noreferrer">{station.attribution.text}</a>
          </div>
        )}
      </div>

      <button className="sp-nav" onClick={() => navigateTo(station.lat, station.lng, station.name)}>
        <span aria-hidden="true">▲</span> Navigate
      </button>
    </div>
  );
}
