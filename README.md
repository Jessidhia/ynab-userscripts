# ynab-userscripts

Userscripts to extract transaction data into a format usable by YNAB, generally
QIF.

Scripts always add an extra button that needs to be clicked to perform the
export.

## Rakuten Card

![Image with the injected "YNAB (QIF)" button](./images/rakuten.png)

Parses the very confusing CSV format, cleans the Payee field noise and produces
an easily imported QIF file.

[Install Userscript](https://github.com/Jessidhia/ynab-userscripts/releases/latest/download/rakuten_card.user.js)

## PayPay Bank (née Japan Net Bank)

![Image with the injected "YNAB QIF" button](./images/paypay.png)

Generates a QIF export of the transactions in the account statement.

May require that the Debit Card statement be browsed to in order to correlate
payees. Credit Cards are untested.

[Install Userscript](https://github.com/Jessidhia/ynab-userscripts/releases/latest/download/jnb.user.js)

## Mobile Suica (with experimental Pasmo support)

![Image with the injected "Export to QIF" button](./images/suica.png)

Generates a QIF export of the transactions in the SF利用履歴. Unlike the PDF
export button, this ignores the checkmarks and exports everything that is
visible.

No transactions other than transit fares are annotated in any way in the
statement, so it is better to do manual input of any non-train-related
transactions and use this export strictly for reconciliation.

However, the transactions to enter or exit a train station are very nicely
detailed so the entry/exit station names are exported as the transaction memo.
The payee defaults to `Suica Transport` in this case for autocategorization. I
don't know if buses also get this treatment.

Transactions that add cash to the card are also handled and the payee is always
prefixed with `Charge`.

[Install Userscript](https://github.com/Jessidhia/ynab-userscripts/releases/latest/download/rakuten_card.user.js)
