const firebaseAuthMessages = {
  "auth/unauthorized-domain":
    "Domain hiện tại chưa được cấp quyền trong Firebase Authentication.",
  "auth/popup-blocked":
    "Trình duyệt đã chặn cửa sổ đăng nhập Google. Hãy cho phép popup rồi thử lại.",
  "auth/popup-closed-by-user":
    "Cửa sổ đăng nhập Google đã bị đóng trước khi hoàn tất.",
  "auth/cancelled-popup-request":
    "Một yêu cầu đăng nhập Google khác đang được xử lý. Hãy thử lại.",
  "auth/invalid-api-key":
    "Firebase API key không hợp lệ hoặc chưa được cấu hình.",
  "auth/network-request-failed":
    "Không thể kết nối tới Firebase. Hãy kiểm tra mạng rồi thử lại.",
};

export function getGoogleAuthErrorMessage(error) {
  const apiMessage = error?.response?.data?.message;
  if (apiMessage) return apiMessage;

  const code = error?.code;
  const message = firebaseAuthMessages[code];

  if (message) return `${message} (${code})`;
  if (code?.startsWith("auth/")) return `Đăng nhập Google thất bại (${code}).`;

  return "Đăng nhập Google thất bại. Vui lòng thử lại.";
}

export function logGoogleAuthError(error) {
  console.error("Google sign-in failed", {
    code: error?.code,
    message: error?.message,
    apiStatus: error?.response?.status,
    apiMessage: error?.response?.data?.message,
  });
}
