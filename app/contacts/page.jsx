'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faMagnifyingGlass, faPhone, faEnvelope } from '@fortawesome/free-solid-svg-icons';
import Modal from '../components/common/Modal.jsx';

export default function ContactsPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [latestRequirement, setLatestRequirement] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUser, setChatUser] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatLoadingMore, setChatLoadingMore] = useState(false);
  const [chatHasMore, setChatHasMore] = useState(false);
  const [chatError, setChatError] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatSendError, setChatSendError] = useState('');
  const [automationUpdatingId, setAutomationUpdatingId] = useState(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      fetchUsers({ reset: true, nextOffset: 0, searchTerm: search });
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  async function fetchUsers({ reset = false, nextOffset = 0, searchTerm = '' } = {}) {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const params = new URLSearchParams();
      params.set('limit', '48');
      params.set('offset', String(nextOffset));
      if (searchTerm) params.set('q', searchTerm);
      const response = await fetch(`/api/users?${params.toString()}`);
      const data = await response.json();
      const list = data.data || [];
      const meta = data.meta || {};
      setHasMore(Boolean(meta.hasMore));
      setOffset(meta.nextOffset ?? nextOffset + list.length);
      if (reset) {
        setUsers(list);
      } else {
        setUsers((prev) => [...prev, ...list]);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
      if (reset) {
        setUsers([]);
        setHasMore(false);
        setOffset(0);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  const openDetails = async (user) => {
    setSelectedUser(user);
    setModalOpen(true);
    setChatOpen(false);
    setMessages([]);
    setLatestRequirement(null);
    setModalLoading(true);
    try {
      const [messagesResponse, requirementResponse] = await Promise.all([
        fetch(`/api/users/${user.id}/messages`),
        fetch(`/api/users/${user.id}/requirements`),
      ]);
      const messagesData = await messagesResponse.json();
      const requirementData = await requirementResponse.json();
      setMessages(messagesData.data || []);
      setLatestRequirement(requirementData.data || null);
    } catch (error) {
      console.error('Failed to fetch user messages:', error);
    } finally {
      setModalLoading(false);
    }
  };

  const openChat = async (user) => {
    setChatUser(user);
    setChatOpen(true);
    setModalOpen(false);
    setChatMessages([]);
    setChatLoading(true);
    setChatHasMore(false);
    setChatError('');
    setChatDraft('');
    setChatSendError('');
    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      const response = await fetch(`/api/users/${user.id}/messages?${params.toString()}`);
      const data = await response.json();
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || 'Failed to load messages');
      }
      const list = Array.isArray(data?.data) ? data.data : [];
      setChatHasMore(Boolean(data?.meta?.hasMore));
      if (!Array.isArray(data?.data)) {
        setChatError('Unexpected response format for messages.');
      }
      setChatMessages(list);
    } catch (error) {
      console.error('Failed to fetch chat messages:', error);
      setChatError(error.message || 'Failed to fetch chat messages.');
    } finally {
      setChatLoading(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatUser || chatSending) return;
    const messageText = chatDraft.trim();
    if (!messageText) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      id: tempId,
      user_id: chatUser.id,
      admin_id: null,
      message_text: messageText,
      message_type: 'outgoing',
      status: 'sent',
      created_at: new Date().toISOString(),
    };

    setChatSending(true);
    setChatSendError('');
    setChatDraft('');
    setChatMessages((prev) => [...prev, optimistic]);

    try {
      const response = await fetch(`/api/users/${chatUser.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText }),
      });
      const data = await response.json();
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || 'Failed to send message');
      }
      if (data?.data?.id) {
        setChatMessages((prev) =>
          prev.map((msg) => (msg.id === tempId ? data.data : msg))
        );
      }
    } catch (error) {
      console.error('Failed to send chat message:', error);
      setChatSendError(error.message || 'Failed to send message.');
      setChatMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      setChatDraft(messageText);
    } finally {
      setChatSending(false);
    }
  };

  const loadOlderMessages = async () => {
    if (!chatUser || chatLoadingMore || !chatHasMore) return;
    const oldest = [...chatMessages]
      .filter((msg) => msg?.created_at)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
    if (!oldest?.created_at) return;

    setChatLoadingMore(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      params.set('before', oldest.created_at);
      const response = await fetch(`/api/users/${chatUser.id}/messages?${params.toString()}`);
      const data = await response.json();
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || 'Failed to load older messages');
      }
      const list = Array.isArray(data?.data) ? data.data : [];
      setChatHasMore(Boolean(data?.meta?.hasMore));
      if (list.length > 0) {
        setChatMessages((prev) => [...prev, ...list]);
      }
    } catch (error) {
      console.error('Failed to load older messages:', error);
      setChatError(error.message || 'Failed to load older messages.');
    } finally {
      setChatLoadingMore(false);
    }
  };

  const toggleContactAutomation = async (user) => {
    if (!user?.id || automationUpdatingId === user.id) return;
    const nextValue = !Boolean(user.automation_disabled);
    setAutomationUpdatingId(user.id);
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ automation_disabled: nextValue }),
      });
      const data = await response.json();
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || 'Failed to update automation setting');
      }
      const updated = data?.data || {};
      setUsers((prev) => prev.map((item) => (item.id === user.id ? { ...item, ...updated } : item)));
      setSelectedUser((prev) => (prev?.id === user.id ? { ...prev, ...updated } : prev));
      setChatUser((prev) => (prev?.id === user.id ? { ...prev, ...updated } : prev));
    } catch (error) {
      window.alert(error.message || 'Failed to update automation setting.');
    } finally {
      setAutomationUpdatingId(null);
    }
  };

  const filteredUsers = users;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-aa-orange mx-auto mb-4"></div>
          <p className="text-gray-600">Loading leads...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <FontAwesomeIcon icon={faUsers} className="text-aa-orange" style={{ fontSize: 32 }} />
          Leads
        </h1>
        
        <div className="relative">
          <FontAwesomeIcon
            icon={faMagnifyingGlass}
            className="absolute left-3 top-3 text-gray-400"
            style={{ fontSize: 20 }}
          />
          <input
            type="text"
            placeholder="Search by name, phone, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-aa-orange"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredUsers.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-gray-50 rounded-lg">
            <FontAwesomeIcon icon={faUsers} className="mx-auto text-gray-400 mb-2" style={{ fontSize: 48 }} />
            <p className="text-gray-500">No leads found</p>
          </div>
        ) : (
          filteredUsers.map((user) => (
            <div
              key={user.id}
              className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-lg transition"
            >
              <h3 className="font-bold text-lg text-gray-900 mb-2">{user.name}</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faPhone} className="text-aa-orange" style={{ fontSize: 16 }} />
                  <span>{user.phone}</span>
                </div>
                {user.email && (
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon icon={faEnvelope} className="text-aa-orange" style={{ fontSize: 16 }} />
                    <span>{user.email}</span>
                  </div>
                )}
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-gray-500">Assigned to: <span className="font-semibold">{user.admin_name}</span></p>
                  <p className="text-xs text-gray-500 mt-1">
                    Automation: <span className={`font-semibold ${user.automation_disabled ? 'text-red-600' : 'text-green-600'}`}>
                      {user.automation_disabled ? 'Disabled' : 'Enabled'}
                    </span>
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t flex gap-2">
                <button
                  className="flex-1 px-3 py-1 bg-aa-orange text-white rounded text-sm font-semibold hover:bg-opacity-90 transition"
                  onClick={() => openChat(user)}
                >
                  Message
                </button>
                <button
                  className="flex-1 px-3 py-1 border border-aa-orange text-aa-orange rounded text-sm font-semibold hover:bg-aa-orange hover:text-white transition"
                  onClick={() => openDetails(user)}
                >
                  View
                </button>
              </div>
              <button
                className={`mt-2 w-full px-3 py-1 border rounded text-sm font-semibold transition ${
                  user.automation_disabled
                    ? 'border-green-600 text-green-600 hover:bg-green-50'
                    : 'border-red-600 text-red-600 hover:bg-red-50'
                }`}
                onClick={() => toggleContactAutomation(user)}
                disabled={automationUpdatingId === user.id}
              >
                {automationUpdatingId === user.id
                  ? 'Updating...'
                  : user.automation_disabled
                    ? 'Enable Automation'
                    : 'Disable Automation'}
              </button>
            </div>
          ))
        )}
      </div>

      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => fetchUsers({ reset: false, nextOffset: offset, searchTerm: search })}
            disabled={loadingMore}
            className="px-5 py-2 rounded-full border border-aa-orange text-aa-orange font-semibold hover:bg-aa-orange hover:text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Lead Details"
        size="md"
      >
        {!selectedUser ? (
          <p className="text-aa-gray">No lead selected.</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-aa-orange/10 flex items-center justify-center">
                <span className="text-lg font-semibold text-aa-orange">
                  {selectedUser.name?.charAt(0) || 'U'}
                </span>
              </div>
              <div>
                <p className="text-xl font-bold text-aa-dark-blue">{selectedUser.name || 'Unknown'}</p>
                <p className="text-sm text-aa-gray">{selectedUser.admin_name ? `Assigned to ${selectedUser.admin_name}` : 'Unassigned'}</p>
                <p className={`text-xs mt-1 font-semibold ${selectedUser.automation_disabled ? 'text-red-600' : 'text-green-600'}`}>
                  Automation {selectedUser.automation_disabled ? 'Disabled' : 'Enabled'}
                </p>
              </div>
            </div>

            <button
              className={`w-full px-3 py-2 border rounded text-sm font-semibold transition ${
                selectedUser.automation_disabled
                  ? 'border-green-600 text-green-600 hover:bg-green-50'
                  : 'border-red-600 text-red-600 hover:bg-red-50'
              }`}
              onClick={() => toggleContactAutomation(selectedUser)}
              disabled={automationUpdatingId === selectedUser.id}
            >
              {automationUpdatingId === selectedUser.id
                ? 'Updating...'
                : selectedUser.automation_disabled
                  ? 'Enable Automation for This Lead'
                  : 'Disable Automation for This Lead'}
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 border border-gray-200 rounded-lg">
                <p className="text-xs text-aa-gray uppercase mb-1">Phone</p>
                <p className="font-semibold text-aa-text-dark">{selectedUser.phone || '—'}</p>
              </div>
              <div className="p-4 border border-gray-200 rounded-lg">
                <p className="text-xs text-aa-gray uppercase mb-1">Email</p>
                <p className="font-semibold text-aa-text-dark">{selectedUser.email || '—'}</p>
              </div>
              <div className="p-4 border border-gray-200 rounded-lg">
                <p className="text-xs text-aa-gray uppercase mb-1">Created At</p>
                <p className="font-semibold text-aa-text-dark">
                  {selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleString() : '—'}
                </p>
              </div>
              <div className="p-4 border border-gray-200 rounded-lg">
                <p className="text-xs text-aa-gray uppercase mb-1">Updated At</p>
                <p className="font-semibold text-aa-text-dark">
                  {selectedUser.updated_at ? new Date(selectedUser.updated_at).toLocaleString() : '—'}
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold text-aa-dark-blue mb-3">Message Details</h3>
              {modalLoading ? (
                <p className="text-aa-gray">Loading messages...</p>
              ) : !latestRequirement ? (
                <p className="text-aa-gray">No lead details found for this lead.</p>
              ) : (
                <div className="space-y-3">
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <p className="text-xs text-aa-gray uppercase mb-1">Lead Reason</p>
                    <p className="font-semibold text-aa-text-dark mb-2">
                      {latestRequirement.requirement_text || '—'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        title={chatUser ? `Chat with ${chatUser.name || 'Lead'}` : 'Chat'}
        size="lg"
      >
        {!chatUser ? (
          <p className="text-aa-gray">No lead selected.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-aa-orange/10 flex items-center justify-center">
                  <span className="text-lg font-semibold text-aa-orange">
                    {chatUser.name?.charAt(0) || 'U'}
                  </span>
                </div>
                <div>
                  <p className="text-lg font-semibold text-aa-dark-blue">{chatUser.name || 'Unknown'}</p>
                  <p className="text-sm text-aa-gray">{chatUser.phone || '—'}</p>
                </div>
              </div>
              <div className="text-xs text-aa-gray">
                {chatUser.admin_name ? `Assigned to ${chatUser.admin_name}` : 'Unassigned'}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gradient-to-b from-gray-50 via-white to-gray-50 p-4">
              <div className="h-[55vh] overflow-y-auto pr-2">
                {chatLoading ? (
                  <p className="text-aa-gray">Loading conversation...</p>
                ) : chatError ? (
                  <p className="text-red-600">{chatError}</p>
                ) : chatMessages.length === 0 ? (
                  <p className="text-aa-gray">No messages found for this lead.</p>
                ) : (
                  <div className="space-y-4">
                    {chatHasMore && (
                      <div className="flex justify-center">
                        <button
                          onClick={loadOlderMessages}
                          disabled={chatLoadingMore}
                          className="px-4 py-1.5 rounded-full border border-gray-300 text-xs text-aa-gray hover:border-aa-orange hover:text-aa-orange transition disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {chatLoadingMore ? 'Loading...' : 'Load older messages'}
                        </button>
                      </div>
                    )}
                    {Array.isArray(chatMessages) ? [...chatMessages]
                      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                      .map((msg) => {
                        const isOutgoing = msg.message_type === 'outgoing';
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[75%] rounded-2xl px-4 py-2 shadow-sm ${
                                isOutgoing
                                  ? 'bg-green-100 text-aa-text-dark rounded-br-md'
                                  : 'bg-white text-aa-text-dark border border-gray-200 rounded-bl-md'
                              }`}
                            >
                              <p className="text-sm leading-relaxed">{msg.message_text || msg.message || '—'}</p>
                              <div className={`mt-2 text-[11px] ${isOutgoing ? 'text-green-700' : 'text-gray-500'}`}>
                                {msg.created_at ? new Date(msg.created_at).toLocaleString() : '—'}
                                {msg.status ? ` • ${msg.status}` : ''}
                              </div>
                            </div>
                          </div>
                        );
                      }) : null}
                  </div>
                )}
              </div>
            </div>

            <div className="border border-gray-200 rounded-2xl p-3 bg-white shadow-sm">
              {chatSendError && (
                <p className="text-xs text-red-600 mb-2">{chatSendError}</p>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      sendChatMessage();
                    }
                  }}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-aa-orange"
                  disabled={chatSending}
                />
                <button
                  onClick={sendChatMessage}
                  disabled={chatSending || !chatDraft.trim()}
                  className="px-4 py-2 rounded-full bg-aa-orange text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {chatSending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
