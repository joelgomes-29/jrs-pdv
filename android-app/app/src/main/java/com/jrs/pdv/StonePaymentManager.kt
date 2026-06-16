package com.jrs.pdv

import android.content.Context
import android.util.Log

/**
 * Camada de integração com o SDK Stone (leitura de cartão na maquininha).
 *
 * Este arquivo está escrito para COMPILAR sem o SDK Stone (para você já conseguir
 * gerar o APK e testar o wrapper/WebView e os pagamentos não-cartão). As chamadas
 * reais ao SDK estão como referência comentada em cada método — descomente depois
 * de:
 *   1) Adicionar a dependência do SDK em app/build.gradle
 *   2) Fazer o onboarding na Stone e obter o Stone Code de ativação
 *   3) Confirmar os nomes de classes/métodos na doc atual:
 *      https://sdkandroid.stone.com.br
 *
 * O padrão abaixo segue o POS Android SDK clássico da Stone
 * (StoneStart / ActiveApplicationProvider / MakeTransactionProvider).
 */
class StonePaymentManager(private val context: Context) {

    companion object { private const val TAG = "StonePayment" }

    private var initialized = false

    /** Inicializa o SDK e verifica se a maquininha já foi ativada. */
    fun initialize() {
        // --- Stone SDK (referência) ---
        // val users = StoneStart.init(context)   // List<UserModel>? -> null se não ativado
        // initialized = users != null
        // ------------------------------
        initialized = false
        Log.d(TAG, "StonePaymentManager init (SDK ainda não vinculado)")
    }

    /**
     * Ativa a maquininha com o Stone Code (executar uma única vez por aparelho).
     */
    fun activate(stoneCode: String, callback: (ok: Boolean, message: String?) -> Unit) {
        // --- Stone SDK (referência) ---
        // val provider = ActiveApplicationProvider(context)
        // provider.useDefaultUI(false)
        // provider.connectionCallback = object : StoneCallbackInterface {
        //     override fun onSuccess() { initialized = true; callback(true, "Maquininha ativada") }
        //     override fun onError()   { callback(false, provider.listOfErrors.toString()) }
        // }
        // provider.activate(stoneCode)
        // ------------------------------
        callback(false, "SDK Stone não vinculado. Adicione a dependência e descomente activate().")
    }

    /**
     * Cobra um valor no cartão pela maquininha.
     * @param amountCents valor em centavos
     * @param type "CREDIT" ou "DEBIT"
     * @param installments parcelas (1 = à vista)
     */
    fun charge(
        amountCents: Long,
        type: String,
        installments: Int,
        callback: (ok: Boolean, message: String?) -> Unit
    ) {
        if (!initialized) {
            callback(false, "Maquininha não ativada. Configure o Stone Code primeiro.")
            return
        }

        // --- Stone SDK (referência) ---
        // val transaction = TransactionObject().apply {
        //     amount = amountCents.toString()                 // em centavos, como String
        //     typeOfTransaction =
        //         if (type == "DEBIT") TypeOfTransactionEnum.DEBIT else TypeOfTransactionEnum.CREDIT
        //     instalmentTransaction = Instalment.getAt(installments) // 1 = à vista
        //     isCapture = true
        // }
        // val provider = MakeTransactionProvider(context, transaction)
        // provider.useDefaultUI(false)
        // provider.connectionCallback = object : StoneCallbackInterface {
        //     override fun onSuccess() {
        //         val approved = transaction.transactionStatus == TransactionStatusEnum.APPROVED
        //         callback(approved, if (approved) "Aprovada" else "Negada: ${transaction.messageFromAuthorize}")
        //     }
        //     override fun onError() { callback(false, provider.listOfErrors.toString()) }
        // }
        // provider.execute()
        // ------------------------------

        callback(false, "SDK Stone não vinculado. Adicione a dependência e descomente charge().")
    }
}
