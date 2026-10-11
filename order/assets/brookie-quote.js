(function () {
  // Email is an optional side effect of an already saved order. A failure must
  // never discard that save or prevent the PNG/consultation flow.
  function create(options) {
    let sending = false;
    async function sendEmail(record) {
      if (!record.data.customerEmail || record.emailSent || sending) return;
      sending = true;
      options.onEmail('sending');
      try {
        const result = await options.postEmail(record.result.orderId, record.data.customerEmail, record.result.emailQuoteToken);
        record.emailSent = true;
        record.maskedEmail = result.maskedEmail;
        options.onEmail('sent', result.maskedEmail);
      } catch (error) {
        options.onEmail('failed', '', error.userMessage || '');
      } finally { sending = false; }
    }
    const flow = window.NMQuote.createFlow({ ...options, beforeProvide: sendEmail });
    return {
      receive: (...args) => flow.receive(...args),
      getSaved: (payload) => flow.getSaved(payload),
      async retryEmail(payload) {
        const record = flow.getSaved(payload);
        if (record?.data) await sendEmail(record);
      },
    };
  }
  window.NMBrookieQuote = { create };
})();
