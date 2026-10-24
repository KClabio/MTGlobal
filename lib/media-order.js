// The order of the photos already on a record after an admin save: the order the form sent (photos dragged into
// place), keeping only addresses the record already has, adding any the form left out in their old order, and
// dropping the ones ticked "Xoá".
function orderMedia(existing, order, remove) {
  const current = existing || [];
  const removed = [].concat(remove || []);
  const sent = [].concat(order || []).filter((url, i, all) => current.includes(url) && all.indexOf(url) === i);
  return sent.concat(current.filter((url) => !sent.includes(url))).filter((url) => !removed.includes(url));
}

module.exports = { orderMedia };
