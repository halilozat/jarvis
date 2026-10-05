import { memo } from 'react';
import { CountUp } from '../CountUp';
import type { Weather } from '../../lib/types';
import { DashPanel, NoData } from './common';
import { WeatherIcon } from './WeatherIcon';

export const WeatherPanel = memo(function WeatherPanel({
  index,
  data,
  loading,
  demo,
  highlight,
}: {
  index: number;
  data: Weather | null;
  loading: boolean;
  demo: boolean;
  highlight: boolean;
}) {
  return (
    <DashPanel index={index} label="Hava" meta={data?.city} demo={demo} highlight={highlight} className="wx">
      {loading ? (
        <NoData loading />
      ) : !data ? (
        <NoData />
      ) : (
        <>
          <div className="wx-main">
            <WeatherIcon icon={data.icon} size={58} />
            <div className="wx-temp">
              <CountUp to={Math.round(data.temp)} digits={0} />
              <span className="deg">°</span>
            </div>
          </div>
          <div className="wx-desc">{data.description}</div>
          <dl className="kv">
            <div><dt>hissedilen</dt><dd>{Math.round(data.feels_like)}°</dd></div>
            <div><dt>bugün</dt><dd>{Math.round(data.today.max)}° / {Math.round(data.today.min)}°</dd></div>
            <div><dt>yağış</dt><dd>{data.today.rain_prob === null ? '—' : `%${data.today.rain_prob}`}</dd></div>
            <div><dt>rüzgâr</dt><dd>{Math.round(data.wind)} km/sa</dd></div>
          </dl>
          <div className="panel-source">open-meteo · {data.updated_at.slice(11, 16)}</div>
        </>
      )}
    </DashPanel>
  );
});
