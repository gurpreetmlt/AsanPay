/**
 * @format
 */
import { AppRegistry } from "react-native";
import Geolocation from "@react-native-community/geolocation";
import App from "./App";
import { name as appName } from "./app.json";
import { registerBackgroundPushHandler } from "./src/lib/push";

// Default "auto" uses the raw GPS chip for high accuracy, which never fixes indoors on many
// phones. Fused (GPS + Wi-Fi + cell) falls back to the Android manager if Play Services is missing.
Geolocation.setRNConfiguration({ locationProvider: "playServices", skipPermissionRequests: false });

registerBackgroundPushHandler();

AppRegistry.registerComponent(appName, () => App);
