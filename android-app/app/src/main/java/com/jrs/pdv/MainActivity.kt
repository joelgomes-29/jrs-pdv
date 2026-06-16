package com.jrs.pdv

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity

/**
 * Activity única: carrega o PWA do JRS PDV numa WebView e instala a ponte
 * JavaScript -> nativo (window.AndroidStone) para acionar o pagamento no
 * cartão pela maquininha Stone.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var stone: StonePaymentManager

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        stone = StonePaymentManager(this)
        stone.initialize()

        webView = findViewById(R.id.webview)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false
        }
        webView.webChromeClient = WebChromeClient()

        // Ponte JS: o PWA chama window.AndroidStone.payCard(...)
        webView.addJavascriptInterface(WebAppInterface(webView, stone), "AndroidStone")

        webView.loadUrl(BuildConfig.PWA_URL)
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}
