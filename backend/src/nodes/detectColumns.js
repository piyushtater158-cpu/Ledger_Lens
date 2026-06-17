/**
 * Node: "Detect Columns & Add Token"
 * Workflow: A (Invoice Payee Extraction — vqSkkv9egxmIVpdv)
 * Mode: runOnceForAllItems
 *
 * Purpose: Auto-detects the header columns in the uploaded spreadsheet (driveLink, payee,
 * account number, IFSC, amount) by regex, adds internal `_idx`/`_token`/`_driveLink`/`_payee`/
 * `_acct`/`_ifsc`/`_amount` fields used by downstream nodes, and preserves the original key
 * names so the final output can write extracted values back into the user's own column names.
 */

const items = $input.all();
if (!items.length) return [];
const token = $('Normalize Upload').first().json._uploadToken || '';
const keys = Object.keys(items[0].json);
const find = (re) => keys.find(k => re.test(k)) || '';
const dLinkKey = find(/drive.*link|invoice.*link|invoice.*url|link|url|drive|invoice|file/i);
const payeeKey = find(/payee|beneficiary|account[_\s-]?name|acc[_\s-]?name/i);
const acctKey  = find(/account[_\s-]?no|acct|a\/c|bank[_\s-]?acc|acc.*no/i);
const ifscKey  = find(/ifsc/i);
const amountKey = find(/amount|total|value|sum|invoice.*amount/i);
const currencyKey = find(/currency|curr|ccy/i);
return items.map((item, idx) => ({
  json: {
    ...item.json,
    _idx:          idx,
    _token:        token,
    _driveLink:    dLinkKey ? String(item.json[dLinkKey] || '').trim() : '',
    _payee:        payeeKey ? String(item.json[payeeKey] || '').trim() : '',
    _acct:         acctKey  ? String(item.json[acctKey]  || '').trim() : '',
    _ifsc:         ifscKey  ? String(item.json[ifscKey]  || '').trim() : '',
    _amount:       amountKey ? String(item.json[amountKey] || '').trim() : '',
    _currency:     currencyKey ? String(item.json[currencyKey] || '').trim() : '',
    _payeeKey:     payeeKey,
    _acctKey:      acctKey,
    _ifscKey:      ifscKey,
    _amountKey:    amountKey,
    _currencyKey:  currencyKey,
    _dLinkKey:     dLinkKey,
    _originalKeys: keys,
    _status:       '',
  },
}));
