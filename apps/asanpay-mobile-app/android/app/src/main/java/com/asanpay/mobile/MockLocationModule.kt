package com.asanpay.mobile

import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Reads Android's Location.isFromMockProvider() flag, which
 * @react-native-community/geolocation does not expose through its JS bridge (see
 * src/lib/geoCapture.ts). Checked against each provider's last known fix rather than requesting
 * a fresh one, since geoCapture.ts already requested a fix moments earlier via the JS library —
 * this avoids a second GPS round trip.
 */
class MockLocationModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "MockLocation"

  @ReactMethod
  fun isMockLocation(promise: com.facebook.react.bridge.Promise) {
    try {
      if (reactContext.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) !=
          PackageManager.PERMISSION_GRANTED &&
          reactContext.checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) !=
              PackageManager.PERMISSION_GRANTED) {
        promise.resolve(null)
        return
      }

      val lm = reactContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
      if (lm == null) {
        promise.resolve(null)
        return
      }

      var sawAny = false
      var mockDetected = false
      for (provider in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
        val loc = try {
          lm.getLastKnownLocation(provider)
        } catch (e: SecurityException) {
          null
        }
        if (loc != null) {
          sawAny = true
          @Suppress("DEPRECATION")
          if (loc.isFromMockProvider) {
            mockDetected = true
          }
        }
      }

      if (!sawAny) {
        promise.resolve(null)
      } else {
        promise.resolve(mockDetected)
      }
    } catch (e: Exception) {
      promise.reject("MOCK_LOCATION_CHECK_FAILED", e.message, e)
    }
  }
}
