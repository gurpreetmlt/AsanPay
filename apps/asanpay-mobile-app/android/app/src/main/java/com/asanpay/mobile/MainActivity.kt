package com.asanpay.mobile

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability

class MainActivity : ReactActivity() {

  private lateinit var appUpdateManager: AppUpdateManager
  private var restartDialog: AlertDialog? = null

  private val updateLauncher =
    registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) {}

  private val installListener = InstallStateUpdatedListener { state ->
    if (state.installStatus() == InstallStatus.DOWNLOADED) showRestartPrompt()
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "AsanPay"

  override fun onCreate(savedInstanceState: Bundle?) {
    // Must run before super — keeps branded splash until first draw (matches React splash blue).
    installSplashScreen()
    // Edge-to-edge is applied by ReactActivity (edgeToEdgeEnabled in gradle.properties);
    // insets via safe-area-context.
    super.onCreate(savedInstanceState)
    if (BuildConfig.ENABLE_SECURE_SCREEN) {
      // Block screenshots / recent-apps thumbnails for Aadhaar, OTP and PIN surfaces.
      window.setFlags(
        WindowManager.LayoutParams.FLAG_SECURE,
        WindowManager.LayoutParams.FLAG_SECURE,
      )
    }
    appUpdateManager = AppUpdateManagerFactory.create(this)
    appUpdateManager.registerListener(installListener)
    if (savedInstanceState == null) promptPlayUpdate()
  }

  override fun onResume() {
    super.onResume()
    appUpdateManager.appUpdateInfo.addOnSuccessListener { info ->
      if (info.installStatus() == InstallStatus.DOWNLOADED) {
        showRestartPrompt()
      } else if (
        info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
      ) {
        startUpdate(info, AppUpdateType.IMMEDIATE)
      }
    }
  }

  override fun onDestroy() {
    appUpdateManager.unregisterListener(installListener)
    restartDialog?.dismiss()
    super.onDestroy()
  }

  /**
   * Google Play in-app update. Only works for installs from Play (not adb / sideload).
   * Release priority 4–5 (set via the Play Developer API) forces a blocking update;
   * anything lower shows the Play "Update available" sheet and downloads in the background.
   */
  private fun promptPlayUpdate() {
    appUpdateManager.appUpdateInfo.addOnSuccessListener { info ->
      if (info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE) return@addOnSuccessListener
      val type = when {
        info.updatePriority() >= 4 && info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE) ->
          AppUpdateType.IMMEDIATE
        info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE) -> AppUpdateType.FLEXIBLE
        info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE) -> AppUpdateType.IMMEDIATE
        else -> return@addOnSuccessListener
      }
      startUpdate(info, type)
    }
  }

  private fun startUpdate(info: AppUpdateInfo, type: Int) {
    runCatching {
      appUpdateManager.startUpdateFlowForResult(
        info,
        updateLauncher,
        AppUpdateOptions.newBuilder(type).build(),
      )
    }
  }

  private fun showRestartPrompt() {
    if (isFinishing || restartDialog?.isShowing == true) return
    restartDialog = AlertDialog.Builder(this)
      .setTitle("Update ready")
      .setMessage("A new version of AsanPay has been downloaded. Restart the app to install it.")
      .setPositiveButton("Restart") { _, _ -> appUpdateManager.completeUpdate() }
      .setNegativeButton("Later", null)
      .show()
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
