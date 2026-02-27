'use client';
import { useEffect, useState } from 'react';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import Badge from '../components/common/Badge.jsx';
import Modal from '../components/common/Modal.jsx';
import Input from '../components/common/Input.jsx';
import Loader from '../components/common/Loader.jsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPaperPlane,
  faCalendarDays,
  faUsers,
  faCircleCheck,
  faCircleXmark,
  faClock,
} from '@fortawesome/free-solid-svg-icons';

export default function BroadcastPage() {
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [stats, setStats] = useState({
    total_count: 0,
    total_sent: 0,
    total_delivered: 0,
    scheduled_count: 0,
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBroadcast, setNewBroadcast] = useState({
    title: '',
    message: '',
    target_audience: 'all',
    scheduled_at: ''
  });

  useEffect(() => {
    fetchBroadcasts({ reset: true, nextOffset: 0 });
  }, []);

  const fetchBroadcasts = async ({ reset = false, nextOffset = 0 } = {}) => {
    if (!reset) {
      setLoadingMore(true);
    }
    try {
      const params = new URLSearchParams();
      params.set('limit', '25');
      params.set('offset', String(nextOffset));
      const broadcastsRes = await fetch(`/api/broadcasts?${params.toString()}`, { credentials: 'include' });
      const broadcastsData = await broadcastsRes.json();
      const list = broadcastsData.data || [];
      const meta = broadcastsData.meta || {};
      const nextStats = broadcastsData.stats || {};
      setStats((prev) => ({
        total_count: Number(nextStats.total_count ?? prev.total_count ?? 0),
        total_sent: Number(nextStats.total_sent ?? prev.total_sent ?? 0),
        total_delivered: Number(nextStats.total_delivered ?? prev.total_delivered ?? 0),
        scheduled_count: Number(nextStats.scheduled_count ?? prev.scheduled_count ?? 0),
      }));
      setHasMore(Boolean(meta.hasMore));
      setOffset(meta.nextOffset ?? nextOffset + list.length);
      if (reset) {
        setBroadcasts(list);
      } else {
        setBroadcasts((prev) => [...prev, ...list]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      if (reset) {
        setBroadcasts([]);
        setHasMore(false);
        setOffset(0);
        setStats({
          total_count: 0,
          total_sent: 0,
          total_delivered: 0,
          scheduled_count: 0,
        });
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleCreateBroadcast = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: newBroadcast.title,
          message: newBroadcast.message,
          target_audience: newBroadcast.target_audience,
          scheduled_at: newBroadcast.scheduled_at,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create broadcast');
      }
      setShowCreateModal(false);
      setNewBroadcast({ title: '', message: '', target_audience: 'all', scheduled_at: '' });
      fetchBroadcasts({ reset: true, nextOffset: 0 });
    } catch (error) {
      console.error('Error creating broadcast:', error);
    }
  };

  const statusIcons = {
    sent: <FontAwesomeIcon icon={faCircleCheck} className="text-green-600" style={{ fontSize: 18 }} />,
    scheduled: <FontAwesomeIcon icon={faClock} className="text-yellow-600" style={{ fontSize: 18 }} />,
    draft: <FontAwesomeIcon icon={faClock} className="text-gray-600" style={{ fontSize: 18 }} />,
    failed: <FontAwesomeIcon icon={faCircleXmark} className="text-red-600" style={{ fontSize: 18 }} />
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader size="lg" text="Loading broadcasts..." />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="broadcast-page">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-aa-dark-blue mb-2">Broadcast</h1>
          <p className="text-aa-gray">Send messages to multiple contacts at once</p>
        </div>
        <Button
          variant="primary"
          icon={<FontAwesomeIcon icon={faPaperPlane} style={{ fontSize: 18 }} />}
          onClick={() => setShowCreateModal(true)}
          className="w-full sm:w-auto"
        >
          Create Campaign
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-aa-gray text-sm font-semibold mb-1">Total Campaigns</p>
              <h3 className="text-2xl font-bold text-aa-dark-blue">{stats.total_count}</h3>
            </div>
            <div className="w-12 h-12 bg-aa-orange/10 rounded-lg flex items-center justify-center">
              <FontAwesomeIcon icon={faPaperPlane} className="text-aa-orange" style={{ fontSize: 24 }} />
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-aa-gray text-sm font-semibold mb-1">Total Sent</p>
              <h3 className="text-2xl font-bold text-aa-dark-blue">
                {stats.total_sent}
              </h3>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <FontAwesomeIcon icon={faCircleCheck} className="text-green-600" style={{ fontSize: 24 }} />
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-aa-gray text-sm font-semibold mb-1">Delivered</p>
              <h3 className="text-2xl font-bold text-aa-dark-blue">
                {stats.total_delivered}
              </h3>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FontAwesomeIcon icon={faUsers} className="text-aa-dark-blue" style={{ fontSize: 24 }} />
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-aa-gray text-sm font-semibold mb-1">Scheduled</p>
              <h3 className="text-2xl font-bold text-aa-dark-blue">
                {stats.scheduled_count}
              </h3>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <FontAwesomeIcon icon={faCalendarDays} className="text-yellow-600" style={{ fontSize: 24 }} />
            </div>
          </div>
        </Card>
      </div>

      {/* Broadcast History */}
      <Card>
        <h3 className="text-xl font-bold text-aa-dark-blue mb-4">Campaign History</h3>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-4 px-4 text-sm font-semibold text-aa-gray uppercase">Campaign</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-aa-gray uppercase">Status</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-aa-gray uppercase">Sent</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-aa-gray uppercase">Delivered</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-aa-gray uppercase">Created By</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-aa-gray uppercase">Date</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-aa-gray uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {broadcasts.map(broadcast => (
                <tr key={broadcast.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`broadcast-${broadcast.id}`}>
                  <td className="py-4 px-4">
                    <div>
                      <p className="font-semibold text-aa-text-dark">{broadcast.title}</p>
                      <p className="text-xs text-aa-gray mt-1 truncate max-w-xs">{broadcast.message}</p>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      {statusIcons[broadcast.status]}
                      <Badge variant={
                        broadcast.status === 'sent' ? 'green' :
                        broadcast.status === 'scheduled' ? 'yellow' :
                        broadcast.status === 'failed' ? 'red' : 'default'
                      }>
                        {broadcast.status}
                      </Badge>
                    </div>
                  </td>
                  <td className="py-4 px-4 font-semibold text-aa-dark-blue">{broadcast.sent_count}</td>
                  <td className="py-4 px-4 font-semibold text-green-600">{broadcast.delivered_count}</td>
                  <td className="py-4 px-4 text-aa-gray text-sm">{broadcast.created_by_name || 'System'}</td>
                  <td className="py-4 px-4 text-aa-gray text-sm">
                    {new Date(broadcast.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-4 px-4">
                    <button className="text-aa-orange hover:underline text-sm font-semibold">
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 md:hidden">
          {broadcasts.map((broadcast) => (
            <div
              key={broadcast.id}
              className="rounded-xl border border-gray-200 p-4"
              data-testid={`broadcast-mobile-${broadcast.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-aa-text-dark truncate">{broadcast.title}</p>
                  <p className="text-xs text-aa-gray mt-1 line-clamp-2">{broadcast.message}</p>
                </div>
                <Badge
                  variant={
                    broadcast.status === 'sent'
                      ? 'green'
                      : broadcast.status === 'scheduled'
                      ? 'yellow'
                      : broadcast.status === 'failed'
                      ? 'red'
                      : 'default'
                  }
                >
                  {broadcast.status}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-aa-gray">Sent</p>
                  <p className="font-semibold text-aa-text-dark">{broadcast.sent_count}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-aa-gray">Delivered</p>
                  <p className="font-semibold text-aa-text-dark">{broadcast.delivered_count}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-aa-gray">Created by</p>
                  <p className="font-semibold text-aa-text-dark truncate">
                    {broadcast.created_by_name || 'System'}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-aa-gray">Date</p>
                  <p className="font-semibold text-aa-text-dark">
                    {new Date(broadcast.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <button className="text-aa-orange hover:underline text-sm font-semibold">
                  View Details
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => fetchBroadcasts({ reset: false, nextOffset: offset })}
            disabled={loadingMore}
            className="px-5 py-2 rounded-full border border-aa-orange text-aa-orange font-semibold hover:bg-aa-orange hover:text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}

      {/* Create Broadcast Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Broadcast Campaign" size="lg">
        <form onSubmit={handleCreateBroadcast} className="space-y-4">
          <Input
            label="Campaign Title"
            value={newBroadcast.title}
            onChange={(e) => setNewBroadcast({ ...newBroadcast, title: e.target.value })}
            placeholder="Enter campaign title"
            required
          />
          
          <div>
            <label className="block text-sm font-semibold text-aa-text-dark mb-2">Message</label>
            <textarea
              value={newBroadcast.message}
              onChange={(e) => setNewBroadcast({ ...newBroadcast, message: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg outline-none focus:border-aa-orange"
              rows="5"
              placeholder="Type your broadcast message..."
              required
            />
            <p className="text-xs text-aa-gray mt-1">{newBroadcast.message.length} characters</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-aa-text-dark mb-2">Target Audience</label>
            <select
              value={newBroadcast.target_audience}
              onChange={(e) => setNewBroadcast({ ...newBroadcast, target_audience: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg outline-none focus:border-aa-orange"
            >
              <option value="all">All Contacts</option>
              <option value="vip">VIP Contacts</option>
              <option value="new">New Contacts</option>
              <option value="interested">Interested Contacts</option>
            </select>
          </div>

          <Input
            label="Schedule Date & Time (Optional)"
            type="datetime-local"
            value={newBroadcast.scheduled_at}
            onChange={(e) => setNewBroadcast({ ...newBroadcast, scheduled_at: e.target.value })}
          />

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              icon={<FontAwesomeIcon icon={faPaperPlane} style={{ fontSize: 18 }} />}
            >
              Create Campaign
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)} className="flex-1">
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
