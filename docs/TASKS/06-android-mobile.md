# Task 06 — Android Mobile

## App
`apps/mobile` — AsanPay RN CLI 0.76, Android only — npm `@asanpay/mobile`

## Key files
| Path | Purpose |
|------|---------|
| `App.tsx` | Entry |
| `src/navigation/RootNavigator.tsx` | Role → screen |
| `src/screens/LoginScreen.tsx` | portal: "agent" |
| `src/screens/RoleHomeScreens.tsx` | Per-role home |
| `src/lib/api.ts` | API base URL |
| `metro.config.js` | Monorepo paths |
| `android/` | Native + future biometric |

## API URL
- Emulator: `http://10.0.2.2:4000/api`
- Physical device: your LAN IP or VPS URL

## Commands
```bash
npm run dev:mobile
npm run android
```

## Next features (planned)
- Bottom tabs (Services, History, Wallet, Account)
- Biometric native module (Mantra/Morpho)
- react-native-keychain for token storage
