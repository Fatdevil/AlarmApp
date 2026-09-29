# Alarm App

Tids- och platslarm som körs helt på enheten. Expo SDK 57 · React Native 0.86 · Expo Router · expo-sqlite.

## Kom igång

Appen använder bakgrundsgeofencing, push, systemlarm och egna notisknappar – det fungerar inte i Expo Go.
Den behöver en **development build**.

### Enklast: bygg i molnet via expo.dev (ingen Xcode/Android Studio)

1. Koppla GitHub-repot till projektet på expo.dev.
2. Starta ett bygge: plattform, gren och profil `development` (Android ger en APK att installera direkt).
3. Skanna QR-koden med telefonen och installera.

Profiler i `eas.json`:

| Profil | Till för |
|---|---|
| `development` | Dev-klient för att testa på egen telefon |
| `preview` | Installerbar app för interna testare (Android APK) |
| `production` | Butiksversion (App Store / Google Play) |

iPhone kräver ett Apple Developer-konto (99 USD/år), oavsett byggsätt.

### Från terminalen

```sh
git clone https://github.com/Fatdevil/AlarmApp.git
cd AlarmApp
npm install
npx eas-cli login
npx eas-cli build --profile development --platform android   # eller ios
# alternativt lokalt: npx expo run:android / npx expo run:ios (kräver Android Studio / Xcode 26)
```

## Kontroller

```sh
npm run check   # typecheck + lint + tester
```

Androids schemaläggningslogik har egna JVM-tester (`modules/native-alarm/android/src/test`).
De kräver Android-projektet: `npx expo prebuild -p android && cd android && ./gradlew :native-alarm:testDebugUnitTest`.
GitHub Actions kör båda kontrollstegen automatiskt på varje pull request och push till `main`.

## Struktur

| Mapp | Innehåll |
|---|---|
| `app/(tabs)/` | Flikarna Påminnelser och Agenda |
| `app/` | Övriga skärmar: nytt larm, inställningar, diagnostik |
| `src/logic/` | Ren logik utan native-beroenden (tid, sektioner, validering) – enhetstestad |
| `src/services/` | Databas, notiser, geofencing, push och larmflöden (`alarms.ts`) |
| `src/components/` | UI-komponenter |
| `__tests__/` | Jest-tester |

Diagnostikvyn nås via Inställningar → tryck 7 gånger på versionsnumret (alltid synlig i dev-läge).

## Inriktning

Appen är en påminnelseapp med tid och plats – inte en ersättning för telefonens
väckarklocka (den togs bort för att fokusera på det som skiljer appen från Klocka-appen).

Agendan visar kommande påminnelser dag för dag, även långt fram i tiden. Sparade platser
(Inställningar → Mina platser) kan väljas direkt i "Nytt larm"; larm på samma plats delar en zon.
En tidspåminnelse kan följas upp vid en sparad plats ("Följ upp vid plats"): den ringer vid
tiden och påminner sedan igen när du lämnar eller kommer till platsen. "Klar" stänger båda;
snooza eller stäng av tidslarmet för att låta platsen fortsätta bevakas. Zonen registreras
direkt men larmar först vid en passage efter tiden; är du redan där när tiden kommer är
tidslarmet påminnelsen, och platsen påminner nästa gång tills du trycker "Klar". På iPhone utan systemlarm (iOS 17–18 eller nekad larmbehörighet) ringer påminnelser som
notiser, och iOS håller högst 64 i schemat. Appen håller då de närmast kommande där och fyller
på resten när appen öppnas, kommer till förgrunden eller när larm blir klara/raderas
(`src/services/notificationBudget.ts`). Upprepade påminnelser börjar fortfarande direkt –
AlarmKit kan inte vänta med att börja upprepa. Vänlarm (godkänn/avvisa med kommentar, Klar) byggs först efter
enhetstesterna nedan och kräver en server med inloggning.

**Integritet:** positionen lämnar aldrig telefonen och ingen kan följa någons GPS – se
[docs/PRIVACY.md](docs/PRIVACY.md). Appen har i dag ingen server och skickar ingenting.

## Systemlarm (`modules/native-alarm`)

Lokal Expo-modul som låter tidspåminnelser ringa som riktiga systemlarm i stället för notiser:

- **iOS 26+ – AlarmKit:** ringer i tyst läge och med Fokus, visas på låsskärmen och i Dynamic Island.
  Äldre iOS faller tillbaka till notiser (AlarmKit länkas svagt).
- **Android – `AlarmManager.setAlarmClock`:** exakt även i Doze, helskärmsvy över låsskärmen,
  ljud som upprepas tills man stänger av, Snooza 10 min, återställs efter omstart.

Om modulen saknas eller behörighet nekas används `expo-notifications` automatiskt.

### Testa på enhet (kan inte verifieras i CI)

- [ ] iOS 26: skapa larm om 1 min, lås telefonen, sätt tyst läge → larmet ringer i helskärm
- [ ] iOS 26: upprepat larm (vardagar) visas i systemets larmlista och kan stängas av
- [ ] iOS 17–18: larm faller tillbaka till notis, appen startar utan krasch
- [ ] iOS 17–18: skapa 70 påminnelser en per dag → de närmaste ringer; kortet för de senaste säger "läggs in när appen öppnas närmare tiden"; radera en tidig → en väntande läggs in
- [ ] Android 14+: larm om 1 min med skärmen släckt → helskärmsvy, ljud tills "Stäng av"
- [ ] Android: "Snooza" ringer igen efter 10 min
- [ ] Android: starta om telefonen → schemalagda larm ringer fortfarande
- [ ] Android: stäng av helskärmsnotiser i Inställningar → banner visas i appen
- [ ] Uppdatering från en version med väckarklocka → gamla väckningslarm ringer inte längre
- [ ] Platslarm "lämnar Jobbet" skapat hemma → larmar inte direkt; larmar först när du lämnar jobbet
- [ ] Platslarm "kommer hem" skapat hemma → larmar inte direkt; larmar när du går och kommer tillbaka
- [ ] Skapa/ta bort ett annat platslarm → befintliga platslarm larmar inte av omregistreringen
- [ ] Agenda: tryck på en tom dag om en månad → "Nytt larm" med kl. 09:00 den dagen; påminnelsen syns under rätt dag
- [ ] Agenda: tryck på en dag med prick → listan hoppar till dagen, även långt ner
- [ ] Mina platser: spara Hemma och Jobbet; välj dem i "Nytt larm" utan att söka
- [ ] Två larm på "Jobbet" → båda larmar när du lämnar jobbet
- [ ] Flytta "Jobbet" med ett aktivt larm → larmet följer med och larmar inte direkt av omregistreringen
- [ ] Ta bort en plats som används → larmet finns kvar och fungerar
- [ ] Tid → plats: "Köp blommor" kl. 16 + "När jag lämnar Jobbet" → ringer 16:00; lämnar du jobbet efteråt kommer en påminnelse till
- [ ] Tid → plats: lämna jobbet före 16:00 → ingen platspåminnelse då; tidslarmet ringer 16:00 som vanligt
- [ ] Tid → plats: tryck "Klar" i tidslarmet → ingen platspåminnelse senare
- [ ] Agenda: ett dagligt larm syns varje dag de närmaste två veckorna; platslarm under "Väntar på plats"
