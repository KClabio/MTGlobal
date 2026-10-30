// The password rule for sign-up, "Đổi mật khẩu" and a Google account's first password (routes/auth.js):
// at least 8 characters, and not one that is guessed first. The browser checks only the length (public/js/main.js).
// Passwords set before this rule (6–7 characters) still log in; the rule applies when one is set or changed.
const PASSWORD_MIN = 8;

// The most used passwords of 8+ characters (international leak lists plus common Vietnamese ones), compared without capitals
const COMMON = new Set([
  '12345678', '123456789', '1234567890', '0123456789', '87654321', '987654321', '11223344', '12341234',
  '12121212', '12344321', '123123123', '147258369', '123456123', '1q2w3e4r', '1qaz2wsx', 'qwertyuiop',
  'qwerty123', 'qwerty12', 'asdfghjk', 'asdfghjkl', 'zxcvbnm1', 'password', 'password1', 'password12',
  'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'iloveyou', 'iloveyou1', 'sunshine', 'princess',
  'football', 'baseball', 'superman', 'whatever', 'trustno1', 'starwars', 'welcome1', 'welcome123',
  'computer', 'internet', 'michelle', 'jennifer', 'babygirl', 'butterfly', 'dragon12', 'monkey12',
  'letmein1', 'abc12345', 'abcd1234', 'abc123456', 'a1234567', 'aa123456', 'aa12345678', 'qwer1234',
  'admin123', 'admin1234', 'administrator', 'changeme', 'secret12', 'test1234', 'testtest', 'master12',
  'matkhau1', 'matkhau123', 'matkhau@123', 'anhyeuem', 'anhyeuem1', 'anhyeuem123', 'emyeuanh',
  'emyeuanh1', 'yeuemmaimai', 'iloveu123', 'vietnam1', 'vietnam123', 'hanoi123', 'saigon123', 'hochiminh',
  'conmeo123', 'mtglobal', 'mtglobal1', 'mtglobal123', 'metri123', 'stemlab123', 'robot123', 'hocsinh123',
  'giaovien123', 'truonghoc', 'thaygiao', 'cogiao123', 'zxcvbnm123', 'asd123456', 'qwe123456', 'q1w2e3r4',
]);

// Plain runs ("abcdefgh", "23456789", "98765432"): each character one step after (or before) the last
function isRun(pw) {
  if (!/^([a-z]+|[0-9]+)$/.test(pw)) return false;
  const steps = new Set();
  for (let i = 1; i < pw.length; i += 1) steps.add(pw.charCodeAt(i) - pw.charCodeAt(i - 1));
  return steps.size === 1 && (steps.has(1) || steps.has(-1));
}

// 'length' | 'common' | null
function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return 'length';
  const pw = password.toLowerCase();
  if (COMMON.has(pw) || /^(.)\1+$/.test(pw) || isRun(pw)) return 'common';
  return null;
}

module.exports = { PASSWORD_MIN, passwordProblem };
