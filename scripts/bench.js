import http from 'k6/http';
import { check } from 'k6';

const baseUrl = (__ENV.BASE_URL || '').replace(/\/+$/, '');
const round = __ENV.ROUND || '';

if (!baseUrl) {
  throw new Error('Set BASE_URL, for example http://192.168.1.50:3000');
}
if (!['round1', 'round2'].includes(round)) {
  throw new Error('Set ROUND to round1 or round2');
}

export const options = {
  vus: 1,
  duration: '15s',
  thresholds: {
    checks: ['rate==1'],
  },
};

function hasValidJsonResponse(response) {
  if (response.status !== 200) return false;

  try {
    const body = response.json();
    if (round === 'round1') {
      return body.status === 'ok'
        && ['node', 'rust'].includes(body.runtime)
        && Number.isInteger(body.uptime_ms);
    }
    return body.status === 'recorded' && Number.isInteger(body.total_rows);
  } catch (_) {
    return false;
  }
}

export default function () {
  let response;
  if (round === 'round1') {
    response = http.get(`${baseUrl}/api/ping`, { tags: { round } });
  } else {
    response = http.post(
      `${baseUrl}/api/record`,
      JSON.stringify({ user_id: 'usr_bench', action: 'checkin' }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { round },
      },
    );
  }

  check(response, {
    'HTTP 200': (res) => res.status === 200,
    'valid API response': hasValidJsonResponse,
  });
}
