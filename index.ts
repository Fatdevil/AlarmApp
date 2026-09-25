// Bakgrundstasks måste definieras i modulscope innan appen renderas, så att OS kan
// väcka appen för geofence-händelser och push även när den är avstängd.
import './src/services/geofence';
import './src/services/pushSync';

import 'expo-router/entry';
