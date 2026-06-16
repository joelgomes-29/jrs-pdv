package com.jrs.pdv

import android.webkit.JavascriptInterface
import android.webkit.WebView

/**
 * Ponte exposta ao JavaScript do PWA como `window.AndroidStone`.
 *
 * No PWA:
 *   if (window.AndroidStone) {
 *     window.AndroidStone.payCard(amountCents, "CREDIT", "cb123");
 *   }
 * e o nativo devolve o resultado chamando de volta:
 *   window.onStonePaymentResult(callbackId, ok, message)
 */
class WebAppInterface(
    private val webView: WebView,
    private val stone: StonePaymentManager
) {

    /** Informa ao PWA que a ponte nativa existe (cartão presencial disponível). */
    @JavascriptInterface
    fun isAvailable(): Boolean = true

    /**
     * Inicia uma transação de cartão na maquininha.
     * @param amountCents valor em centavos (ex: 109990 = R$1.099,90)
     * @param type "CREDIT" ou "DEBIT"
     * @param installments número de parcelas (1 = à vista)
     * @param callbackId id para o PWA correlacionar a resposta
     */
    @JavascriptInterface
    fun payCard(amountCents: Long, type: String, installments: Int, callbackId: String) {
        stone.charge(amountCents, type, installments) { ok, message ->
            // Volta para a thread principal e devolve o resultado ao PWA
            webView.post {
                val safeMsg = (message ?: "").replace("'", " ")
                webView.evaluateJavascript(
                    "window.onStonePaymentResult && window.onStonePaymentResult('$callbackId', $ok, '$safeMsg');",
                    null
                )
            }
        }
    }

    /** Ativa a maquininha com o Stone Code (primeiro uso). */
    @JavascriptInterface
    fun activate(stoneCode: String, callbackId: String) {
        stone.activate(stoneCode) { ok, message ->
            webView.post {
                val safeMsg = (message ?: "").replace("'", " ")
                webView.evaluateJavascript(
                    "window.onStonePaymentResult && window.onStonePaymentResult('$callbackId', $ok, '$safeMsg');",
                    null
                )
            }
        }
    }
}
