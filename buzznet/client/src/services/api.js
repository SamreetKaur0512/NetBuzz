import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_SERVER_URL || 'http://localhost:5000',
  timeout: 15000,
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  register:       (data) => api.post('/api/auth/register',        data),
  login:          (data) => api.post('/api/auth/login',           data),
  googleAuth:     (data) => api.post('/api/auth/google',          data),
  googleSetup:    (data) => api.post('/api/auth/google-setup', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  setPassword:    (data) => api.post('/api/auth/set-password',    data),
  changePassword: (data) => api.post('/api/auth/change-password', data),

  // Forgot / reset password
  forgotPassword: (data) => api.post('/api/auth/forgot-password', data),
  resetPassword:  (data) => api.post('/api/auth/reset-password',  data),

  // OTP-based registration
  sendOtp:    (data) => api.post('/api/auth/send-otp',    data),
  verifyOtp:  (data) => data instanceof FormData
    ? api.post('/api/auth/verify-otp', data, { headers: { 'Content-Type': 'multipart/form-data' } })
    : api.post('/api/auth/verify-otp', data),
  resendOtp:  (data) => api.post('/api/auth/resend-otp',  data),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const userAPI = {
  getById:               (id)         => api.get(`/api/users/${id}`),
  getMe:                 ()           => api.get('/api/users/me'),
  update:                (id, data)   => api.put(`/api/users/update/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateNotifications:   (id, data)   => api.put(`/api/users/update/${id}/notifications`, data),
  follow:                (id)         => api.put(`/api/users/follow/${id}`),
  unfollow:              (id)         => api.put(`/api/users/unfollow/${id}`),
  block:                 (id)         => api.put(`/api/users/block/${id}`),
  getBlockedUsers:       ()           => api.get('/api/users/blocked'),
  search:                (q)          => api.get(`/api/users/search?q=${encodeURIComponent(q)}`),
  getPosts:              (id, p=1)    => api.get(`/api/posts/user/${id}?page=${p}`),
  getFollowRequests:     ()           => api.get('/api/users/follow-requests'),
  acceptFollowRequest:   (requestId)  => api.put(`/api/users/follow-requests/${requestId}/accept`),
  rejectFollowRequest:   (requestId)  => api.put(`/api/users/follow-requests/${requestId}/reject`),
  cancelFollowRequest:   (id)         => api.delete(`/api/users/follow/${id}/cancel`),
  deleteAccount:         ()           => api.delete('/api/users/delete-account'),
};

// ── Posts ─────────────────────────────────────────────────────────────────────
export const postAPI = {
  getFeed:           (page=1)                          => api.get(`/api/posts/feed?page=${page}`),
  getExplore:        (page=1)                          => api.get(`/api/posts/explore?page=${page}`),
  create:            (data)                            => api.post('/api/posts/create', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  delete:            (id)                              => api.delete(`/api/posts/${id}`),
  like:              (id)                              => api.put(`/api/posts/like/${id}`),
  comment:           (id, text)                        => api.post(`/api/posts/comment/${id}`, { text }),
  deleteComment:     (postId, commentId)               => api.delete(`/api/posts/${postId}/comment/${commentId}`),
  replyComment:      (postId, commentId, data)         => api.post(`/api/posts/${postId}/comment/${commentId}/reply`, data),
  deleteReply:       (postId, commentId, replyId)      => api.delete(`/api/posts/${postId}/comment/${commentId}/reply/${replyId}`),
  deleteNestedReply: (postId, commentId, replyId, nId) => api.delete(`/api/posts/${postId}/comment/${commentId}/reply/${replyId}/reply/${nId}`),
};

// ── Chat ──────────────────────────────────────────────────────────────────────
export const chatAPI = {
  sendRequest:    (receiverId)              => api.post('/api/chat/request', { receiverId }),
  acceptRequest:  (requestId)               => api.put('/api/chat/accept', { requestId }),
  rejectRequest:  (requestId)               => api.put('/api/chat/reject', { requestId }),
  getRequests:    ()                         => api.get('/api/chat/requests'),
  getConvos:      ()                         => api.get('/api/messages/conversations'),
  getMessages:    (convId, p=1)             => api.get(`/api/messages/${convId}?page=${p}`),
  sendMessage:    (receiverId, messageText)  => api.post('/api/messages/send', { receiverId, messageText }),
  deleteMessage:  (messageId, scope)         => api.delete(`/api/messages/${messageId}`, { data: { scope } }),
  getUnseenCount: ()                         => api.get('/api/messages/unseen'),
};

// ── Groups ────────────────────────────────────────────────────────────────────
export const groupAPI = {
  create:        (data)                    => api.post('/api/groups/create', data),
  getMyGroups:   ()                        => api.get('/api/groups/my'),
  getMessages:   (groupId, p=1)           => api.get(`/api/groups/${groupId}/messages?page=${p}`),
  leave:         (groupId)                => api.put(`/api/groups/${groupId}/leave`),
  invite:        (groupId, userId)        => api.post(`/api/groups/${groupId}/invite`, { userId }),
  getMyInvites:  ()                       => api.get('/api/groups/invites'),
  acceptInvite:  (inviteId)              => api.put(`/api/groups/invites/${inviteId}/accept`),
  declineInvite: (inviteId)             => api.put(`/api/groups/invites/${inviteId}/decline`),
  removeMember:  (groupId, userId)       => api.delete(`/api/groups/${groupId}/members/${userId}`),
  deleteMessage: (groupId, messageId, scope) => api.delete(`/api/groups/${groupId}/messages/${messageId}`, { data: { scope } }),
  deleteGroup:   (groupId)               => api.delete(`/api/groups/${groupId}`),
};

// ── Games ─────────────────────────────────────────────────────────────────────
export const gameAPI = {
  listRooms:  (type) => api.get(`/api/games/rooms${type ? `?gameType=${type}` : ''}`),
  createRoom: (data) => api.post('/api/games/create', data),
  getRoom:    (code) => api.get(`/api/games/${code}`),
  getHistory: ()     => api.get('/api/games/history'),
};

export default api;