# Alarm App

Tids- och platslarm som körs helt på enheten. Expo SDK 57 · React Native 0.86 · Expo Router · expo-sqlite.

## Kom igång

Appen använder bakgrundsgeofencing, push och egna notisknappar – det fungerar inte i Expo Go.
Kör en **development build**:

```sh
npm install
npx expo run:ios       # eller: npx expo run:android
# alternativt molnbygge: eas build --profile development
```

## Kontroller

```sh
npm run check   # typecheck + lint + tester
```

## Struktur

| Mapp | Innehåll |
|---|---|
| `app/` | Skärmar (Expo Router): larmlista, nytt larm, inställningar, diagnostik |
| `src/logic/` | Ren logik utan native-beroenden (tid, sektioner, validering) – enhetstestad |
| `src/services/` | Databas, notiser, geofencing, push och larmflöden (`alarms.ts`) |
| `src/components/` | UI-komponenter |
| `__tests__/` | Jest-tester |

Diagnostikvyn nås via Inställningar → tryck 7 gånger på versionsnumret (alltid synlig i dev-läge).
