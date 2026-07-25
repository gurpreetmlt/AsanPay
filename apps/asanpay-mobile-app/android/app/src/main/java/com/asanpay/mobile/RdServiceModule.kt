package com.asanpay.mobile

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.os.Build
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray

/**
 * UIDAI L1 fingerprint capture via Android Intent API.
 * Discovers installed RD Service apps by CAPTURE intent — package names vary by vendor/version.
 * Only vendor prefixes on the allowlist are used (no arbitrary Intent hijack fallback).
 */
class RdServiceModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private var capturePromise: Promise? = null

  companion object {
    private const val ACTION_CAPTURE = "in.gov.uidai.rdservice.fp.CAPTURE"
    private const val EXTRA_PID_OPTIONS = "PID_OPTIONS"
    private const val EXTRA_PID_DATA = "PID_DATA"
    private const val REQUEST_CAPTURE = 9911

    private val ALLOWED_RD_PREFIXES =
        listOf(
            "com.mantra",
            "com.acpl",
            "com.scl",
            "com.linkwell",
            "com.evolute",
            "com.precision",
            "com.mantralabsindia",
            "com.idemia",
        )
  }

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = "RdService"

  /** Packages that register in.gov.uidai.rdservice.fp.CAPTURE */
  private fun discoverRdPackages(): List<String> {
    val intent = Intent(ACTION_CAPTURE)
    val pm = reactContext.packageManager
    val flags =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          PackageManager.MATCH_ALL
        } else {
          0
        }
    @Suppress("DEPRECATION")
    val resolved: List<ResolveInfo> = pm.queryIntentActivities(intent, flags)
    return resolved
        .mapNotNull { it.activityInfo?.packageName }
        .distinct()
  }

  private fun resolveRdPackage(preferred: String?): String? {
    val found = discoverRdPackages().filter { isAllowedRdPackage(it) }
    if (found.isEmpty()) return null

    val pref = preferred?.trim().orEmpty()
    if (pref.isNotEmpty()) {
      if (!isAllowedRdPackage(pref)) return null
      if (found.contains(pref)) return pref
      // Preferred Mantra label vs actual package — only match within allowlist
      if (pref.contains("mantra", ignoreCase = true)) {
        return found.firstOrNull { it.contains("mantra", ignoreCase = true) }
      }
      return null
    }

    return found.firstOrNull { it.contains("mantra", ignoreCase = true) } ?: found.firstOrNull()
  }

  private fun isAllowedRdPackage(pkg: String): Boolean {
    val p = pkg.lowercase()
    return ALLOWED_RD_PREFIXES.any { p.startsWith(it) }
  }

  @ReactMethod
  fun listRdPackages(promise: Promise) {
    try {
      val arr: WritableArray = Arguments.createArray()
      for (pkg in discoverRdPackages()) {
        arr.pushString(pkg)
      }
      promise.resolve(arr)
    } catch (e: Exception) {
      promise.reject("RD_LIST_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun isPackageAvailable(rdPackage: String, promise: Promise) {
    try {
      val found = discoverRdPackages().filter { isAllowedRdPackage(it) }
      if (found.isEmpty()) {
        promise.resolve(false)
        return
      }
      val pref = rdPackage.trim()
      if (pref.isEmpty()) {
        promise.resolve(found.isNotEmpty())
        return
      }
      if (!isAllowedRdPackage(pref)) {
        promise.resolve(false)
        return
      }
      if (found.contains(pref)) {
        promise.resolve(true)
        return
      }
      if (pref.contains("mantra", ignoreCase = true) &&
          found.any { it.contains("mantra", ignoreCase = true) }) {
        promise.resolve(true)
        return
      }
      promise.resolve(false)
    } catch (e: Exception) {
      promise.reject("RD_CHECK_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun captureFingerprint(rdPackage: String, pidOptions: String, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "App activity not available")
      return
    }
    if (capturePromise != null) {
      promise.reject("CAPTURE_BUSY", "Fingerprint capture already in progress")
      return
    }

    val target = resolveRdPackage(rdPackage)
    if (target == null) {
      promise.reject(
          "RD_NOT_FOUND",
          "No UIDAI fingerprint RD Service found. Install Mantra L1 RDService and open it once.",
      )
      return
    }

    try {
      val intent = Intent(ACTION_CAPTURE)
      intent.setPackage(target)
      intent.putExtra(EXTRA_PID_OPTIONS, pidOptions)
      capturePromise = promise
      activity.startActivityForResult(intent, REQUEST_CAPTURE)
    } catch (e: Exception) {
      capturePromise = null
      promise.reject("CAPTURE_START_FAILED", "Failed to start $target: ${e.message}", e)
    }
  }

  override fun onActivityResult(
    activity: Activity,
    requestCode: Int,
    resultCode: Int,
    data: Intent?,
  ) {
    if (requestCode != REQUEST_CAPTURE) return

    val promise = capturePromise ?: return
    capturePromise = null

    if (resultCode != Activity.RESULT_OK || data == null) {
      promise.reject("CAPTURE_CANCELLED", "Fingerprint capture was cancelled")
      return
    }

    val pidData = data.getStringExtra(EXTRA_PID_DATA)
    if (!pidData.isNullOrBlank()) {
      promise.resolve(pidData)
      return
    }

    val dnc = data.getStringExtra("DNC")
    val dnr = data.getStringExtra("DNR")
    when {
      !dnc.isNullOrBlank() -> promise.reject("DEVICE_NOT_CONNECTED", "Scanner not connected ($dnc)")
      !dnr.isNullOrBlank() -> promise.reject("DEVICE_NOT_READY", "Scanner not ready ($dnr)")
      else -> promise.reject("CAPTURE_FAILED", "RD Service returned no fingerprint data")
    }
  }

  override fun onNewIntent(intent: Intent) {
    // no-op
  }
}
