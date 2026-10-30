import React, { useId } from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

const WALLET_BODY =
  'M212 130H120C105.641 130 94 141.641 94 156V216C94 230.359 105.641 242 120 242H212C226.359 242 238 230.359 238 216V156C238 141.641 226.359 130 212 130Z';

/** App launcher icon (same art as the Android adaptive icon): bevelled blue badge + green wallet. */
export default function Logo({ className = '', size = 48 }: LogoProps) {
  const uid = useId().replace(/:/g, '');
  const rimId = `asanpay-rim-${uid}`;
  const panelId = `asanpay-panel-${uid}`;
  const walletId = `asanpay-wallet-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="48 48 235 235"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} select-none`}
      role="img"
      aria-label="AsanPay"
    >
      <defs>
        <linearGradient id={rimId} x1="56.2456" y1="45.9386" x2="283" y2="285.061" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0B2A9A" />
          <stop offset="1" stopColor="#2A5CDD" />
        </linearGradient>
        <linearGradient id={panelId} x1="60" y1="49" x2="280" y2="281" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2A5CDD" />
          <stop offset="1" stopColor="#0B2A9A" />
        </linearGradient>
        <linearGradient id={walletId} x1="90" y1="120" x2="240" y2="252" gradientUnits="userSpaceOnUse">
          <stop stopColor="#24CC82" />
          <stop offset="1" stopColor="#11A362" />
        </linearGradient>
      </defs>

      <path
        d="M111.903 48.5H219.097C254.113 48.5001 282.5 76.8867 282.5 111.903V219.097C282.5 254.113 254.113 282.5 219.097 282.5H111.903C76.8867 282.5 48.5001 254.113 48.5 219.097V111.903C48.5001 76.8867 76.8867 48.5001 111.903 48.5Z"
        fill={`url(#${rimId})`}
        stroke="#0C298B"
      />
      <path
        d="M114 51.5H218C251.966 51.5 279.5 79.0345 279.5 113V217C279.5 250.966 251.966 278.5 218 278.5H114C80.0345 278.5 52.5 250.966 52.5 217V113C52.5 79.0345 80.0345 51.5 114 51.5Z"
        fill={`url(#${panelId})`}
        stroke="#0C298B"
      />

      <path d={WALLET_BODY} transform="translate(0 9)" fill="#06155A" fillOpacity="0.1" />
      <path d={WALLET_BODY} transform="translate(0 4.5)" fill="#06155A" fillOpacity="0.16" />

      <path
        opacity="0.38"
        d="M208 110H128C123.582 110 120 113.582 120 118V132C120 136.418 123.582 140 128 140H208C212.418 140 216 136.418 216 132V118C216 113.582 212.418 110 208 110Z"
        fill="white"
      />
      <path d={WALLET_BODY} fill={`url(#${walletId})`} />
      <path
        opacity="0.26"
        d="M212 130H120C105.641 130 94 136.716 94 145C94 153.284 105.641 160 120 160H212C226.359 160 238 153.284 238 145C238 136.716 226.359 130 212 130Z"
        fill="white"
      />
      <path
        d="M224 168H210C202.268 168 196 174.268 196 182V194C196 201.732 202.268 208 210 208H224C231.732 208 238 201.732 238 194V182C238 174.268 231.732 168 224 168Z"
        fill="#0B2A9A"
      />
      <path
        d="M209 195C212.866 195 216 191.866 216 188C216 184.134 212.866 181 209 181C205.134 181 202 184.134 202 188C202 191.866 205.134 195 209 195Z"
        fill="white"
      />
      <path
        d="M147.208 158.712C146.296 155.784 144.652 153.468 142.276 151.764C139.9 150.06 136.72 149.208 132.736 149.208H120.784V135.384H178.024V148.56H158.656C160.48 149.952 161.896 151.488 162.904 153.168C163.912 154.848 164.632 156.696 165.064 158.712H178.024V171.96H164.992C164.08 175.704 162.4 179.1 159.952 182.148C157.504 185.196 154.336 187.632 150.448 189.456C151.984 190.128 153.424 190.992 154.768 192.048C156.112 193.104 157.336 194.472 158.44 196.152L176.944 231H159.88C158.248 231 156.868 230.676 155.74 230.028C154.612 229.38 153.688 228.456 152.968 227.256L138.208 197.376C137.584 196.272 136.876 195.468 136.084 194.964C135.292 194.46 134.128 194.208 132.592 194.208H120.784V181.464H132.664C136.6 181.464 139.708 180.6 141.988 178.872C144.268 177.144 145.888 174.84 146.848 171.96H120.712V158.712H147.208Z"
        fill="white"
      />
    </svg>
  );
}
