const GEO_TIMEOUT_MS = 5000;
const VPN_PROVIDER_PATTERN = /proton\s*vpn|protonvpn|nordvpn|expressvpn|surfshark|cyberghost|private internet access|pia vpn|mullvad|ipvanish|windscribe|hide\.me|hotspot shield|tunnelbear|hola vpn|hidemyass|purevpn|vyprvpn|strongvpn|atlas vpn|urban vpn|privadovpn|perfect privacy|google one vpn|google vpn|mozilla vpn|avast secureline|avg secure vpn|bitdefender vpn|kaspersky vpn|mcafee vpn|vpn unlimited|vpncity|purevpn|privatevpn|hide my ass|tor exit|openvpn|wireguard|vpn|proxy|anonymous|datacenter|hosting/i;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ allowed: false, error: 'method_not_allowed' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const vercelCountry = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
    const forwarded = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
    const clientIp = String(forwarded).split(',')[0].trim() || String(req.socket?.remoteAddress || '').trim();
    if (!clientIp) return res.status(503).json({ allowed: false, error: 'client_ip_unknown' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS);
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(clientIp)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'retzef-support-access-check/1.0' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`geo_provider_${response.status}`);
    const geo = await response.json();
    if (geo.success === false) throw new Error('geo_provider_failed');
    const security = geo.security || {};
    const connection = geo.connection || {};
    const networkText = [geo.isp, geo.org, geo.organization, connection.isp, connection.org, connection.organization, geo.asn].filter(Boolean).join(' ');
    const providerDetected = VPN_PROVIDER_PATTERN.test(networkText);
    if (security.vpn || security.proxy || security.tor || security.hosting || security.datacenter || providerDetected) {
      return res.status(403).json({ allowed: false, error: 'vpn_detected', countryCode: String(geo.country_code || vercelCountry || '').toUpperCase() });
    }
    const countryCode = String(geo.country_code || vercelCountry || '').toUpperCase();
    if (!countryCode) return res.status(503).json({ allowed: false, error: 'country_unknown' });
    if (countryCode !== 'IL') return res.status(403).json({ allowed: false, error: 'region_not_allowed', countryCode });
    return res.status(200).json({ allowed: true, countryCode: 'IL', vpnDetected: false });
  } catch (error) {
    return res.status(503).json({ allowed: false, error: 'region_check_failed' });
  }
}
