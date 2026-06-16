# JRS PDV — App Android (maquininha Stone)

App Android que roda **dentro da maquininha Stone** (que é Android). Ele carrega o
PWA do JRS PDV (`/app/`) numa WebView e expõe uma ponte para o **SDK Stone**, que lê
o cartão no próprio aparelho. Toda a interface e a lógica de venda são reaproveitadas
do PWA — o nativo só entra para a leitura do cartão presencial.

## Como funciona

```
Maquininha Stone (Android)
└─ App JRS PDV (este projeto)
   └─ WebView  → carrega https://www.pixetpdv.com.br/app/  (o PWA)
      └─ window.AndroidStone.payCard(...)  → ponte JS→Kotlin
         └─ StonePaymentManager → SDK Stone → leitor de cartão
            └─ resultado → window.onStonePaymentResult(...) → PWA finaliza a venda (/api/sell)
```

- **PIX e dinheiro**: tratados no próprio PWA (PIX gera copia-e-cola).
- **Cartão crédito/débito**: o PWA detecta `window.AndroidStone` e manda para a maquininha.
  No navegador comum (sem o app), cai na confirmação manual.

## Pré-requisitos

1. **Android Studio** (Hedgehog ou superior), JDK 17.
2. Conta/onboarding na **Stone** e um **Stone Code** de ativação da maquininha.
3. Documentação atual do SDK: https://sdkandroid.stone.com.br

## Passos para colocar o cartão funcionando

1. Abra a pasta `android-app/` no Android Studio (File → Open).
2. Em `app/build.gradle`, adicione a dependência do SDK Stone (confirme artefato/versão
   na doc) e sincronize o Gradle.
3. Em `StonePaymentManager.kt`, **descomente** os blocos "Stone SDK (referência)" nos
   métodos `initialize()`, `activate()` e `charge()`.
4. Em `app/build.gradle`, ajuste `PWA_URL` se for testar contra um servidor local
   (ex.: `http://SEU_IP:3000/app/`). Em produção deixe `https://www.pixetpdv.com.br/app/`.
5. Rode o app uma vez e **ative** a maquininha com o Stone Code (chame
   `window.AndroidStone.activate("SEU_STONE_CODE", "cb1")` ou crie um botão de ativação).
6. Gere o APK (Build → Build APK) e instale na maquininha Stone.

## Estrutura

```
android-app/
├─ settings.gradle / build.gradle / gradle.properties
└─ app/
   ├─ build.gradle            ← dependência do SDK Stone + PWA_URL
   └─ src/main/
      ├─ AndroidManifest.xml
      ├─ java/com/jrs/pdv/
      │  ├─ MainActivity.kt          ← WebView + instala a ponte
      │  ├─ WebAppInterface.kt       ← window.AndroidStone (payCard/activate)
      │  └─ StonePaymentManager.kt   ← integração com o SDK Stone (descomentar)
      └─ res/...
```

## Observações

- O projeto **compila sem o SDK** (para você testar o wrapper e os fluxos de
  PIX/dinheiro já). Enquanto o SDK não for vinculado, o cartão retorna a mensagem
  "SDK Stone não vinculado".
- A leitura de cartão **só funciona em maquininha Stone real** com o SDK ativado —
  não funciona em emulador nem em celular comum.
- O wrapper precisa do Gradle Wrapper (`gradlew`). O Android Studio gera os arquivos
  `gradle/wrapper/*` automaticamente ao abrir o projeto (ou rode `gradle wrapper`).
