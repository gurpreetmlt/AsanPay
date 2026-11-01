package com.asanpay.mobile

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(RdServicePackage())
          add(MockLocationPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannels()
    loadReactNative(this)
  }

  // Id must match messaging_android_notification_channel_id in firebase.json.
  private fun createNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel =
      NotificationChannel(PUSH_CHANNEL_ID, "Alerts", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Login approvals, wallet and transaction alerts"
        enableVibration(true)
      }
    getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
  }

  private companion object {
    const val PUSH_CHANNEL_ID = "asanpay_alerts"
  }
}
