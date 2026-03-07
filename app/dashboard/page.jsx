'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMessage, faUsers, faCircleCheck, faCircleExclamation, faCalendarPlus, faCartShopping, faCalendarCheck } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../components/auth/AuthProvider.jsx';
import { hasAppointmentAccess, hasProductAccess } from '../../lib/business.js';

const OVERVIEW_METRICS = [
	{ key: 'total_users', name: 'Users' },
	{ key: 'incoming_messages', name: 'Messages' },
	{ key: 'active_requirements', name: 'Requirements' },
	{ key: 'open_needs', name: 'Open Needs' },
	{ key: 'total_orders', name: 'Orders' },
	{ key: 'total_appointments', name: 'Appointments' },
];

const toCount = (value) => {
	const num = Number(value);
	return Number.isFinite(num) ? num : 0;
};

export default function DashboardPage() {
	const router = useRouter();
	const { user } = useAuth();
	const [stats, setStats] = useState(null);
	const [loading, setLoading] = useState(true);
	const [messages, setMessages] = useState([]);
	const [aiSettings, setAiSettings] = useState({
		ai_enabled: false,
		ai_prompt: '',
		ai_blocklist: '',
		automation_enabled: true,
		whatsapp_pending_recovery_enabled: true,
		whatsapp_only_post_config_messages: true,
		whatsapp_preconfig_message_grace_ms: 30000,
		whatsapp_recovery_window_hours: 24,
		whatsapp_recovery_batch_limit: 20,
		whatsapp_recovery_analysis_message_limit: 18,
		whatsapp_recovery_ai_required: true,
		whatsapp_recovery_ai_model: '',
		appointment_start_hour: 9,
		appointment_end_hour: 20,
		appointment_slot_minutes: 60,
		appointment_window_months: 3,
	});
	const [aiSaving, setAiSaving] = useState(false);
	const [aiStatus, setAiStatus] = useState('');

	useEffect(() => {
		fetchDashboardData();
	}, []);

	async function fetchDashboardData() {
		try {
			const [statsRes, messagesRes, aiRes] = await Promise.all([
				fetch('/api/dashboard/stats'),
				fetch('/api/messages?limit=5'),
				fetch('/api/ai-settings')
			]);

			const statsData = await statsRes.json();
			const messagesData = await messagesRes.json();
			const aiData = await aiRes.json();

			setStats(statsData.data);
			setMessages(messagesData.data || []);
			setAiSettings({
				ai_enabled: Boolean(aiData?.data?.ai_enabled),
				ai_prompt: aiData?.data?.ai_prompt || '',
				ai_blocklist: aiData?.data?.ai_blocklist || '',
				automation_enabled: aiData?.data?.automation_enabled !== false,
				whatsapp_pending_recovery_enabled:
					aiData?.data?.whatsapp_pending_recovery_enabled !== false,
				whatsapp_only_post_config_messages:
					aiData?.data?.whatsapp_only_post_config_messages !== false,
				whatsapp_preconfig_message_grace_ms:
					Number.isInteger(aiData?.data?.whatsapp_preconfig_message_grace_ms)
						? aiData.data.whatsapp_preconfig_message_grace_ms
						: 30000,
				whatsapp_recovery_window_hours:
					Number.isInteger(aiData?.data?.whatsapp_recovery_window_hours)
						? aiData.data.whatsapp_recovery_window_hours
						: 24,
				whatsapp_recovery_batch_limit:
					Number.isInteger(aiData?.data?.whatsapp_recovery_batch_limit)
						? aiData.data.whatsapp_recovery_batch_limit
						: 20,
				whatsapp_recovery_analysis_message_limit:
					Number.isInteger(aiData?.data?.whatsapp_recovery_analysis_message_limit)
						? aiData.data.whatsapp_recovery_analysis_message_limit
						: 18,
				whatsapp_recovery_ai_required:
					aiData?.data?.whatsapp_recovery_ai_required !== false,
				whatsapp_recovery_ai_model: aiData?.data?.whatsapp_recovery_ai_model || '',
				appointment_start_hour: Number.isInteger(aiData?.data?.appointment_start_hour)
					? aiData.data.appointment_start_hour
					: 9,
				appointment_end_hour: Number.isInteger(aiData?.data?.appointment_end_hour)
					? aiData.data.appointment_end_hour
					: 20,
				appointment_slot_minutes: Number.isInteger(aiData?.data?.appointment_slot_minutes)
					? aiData.data.appointment_slot_minutes
					: 60,
				appointment_window_months: Number.isInteger(aiData?.data?.appointment_window_months)
					? aiData.data.appointment_window_months
					: 3,
			});
		} catch (error) {
			console.error('Failed to fetch dashboard data:', error);
		} finally {
			setLoading(false);
		}
	}

	async function saveAiSettings() {
		setAiSaving(true);
		setAiStatus('');
		if (aiSettings.appointment_end_hour <= aiSettings.appointment_start_hour) {
			setAiStatus('End hour must be greater than start hour.');
			setAiSaving(false);
			return;
		}
		if (
			!Number.isFinite(aiSettings.whatsapp_preconfig_message_grace_ms) ||
			aiSettings.whatsapp_preconfig_message_grace_ms < 0 ||
			aiSettings.whatsapp_preconfig_message_grace_ms > 300000
		) {
			setAiStatus('Time buffer must be between 0 and 300000 ms.');
			setAiSaving(false);
			return;
		}
		if (
			!Number.isFinite(aiSettings.whatsapp_recovery_window_hours) ||
			aiSettings.whatsapp_recovery_window_hours < 1 ||
			aiSettings.whatsapp_recovery_window_hours > 168
		) {
			setAiStatus('Look-back time must be between 1 and 168 hours.');
			setAiSaving(false);
			return;
		}
		if (
			!Number.isFinite(aiSettings.whatsapp_recovery_batch_limit) ||
			aiSettings.whatsapp_recovery_batch_limit < 1 ||
			aiSettings.whatsapp_recovery_batch_limit > 200
		) {
			setAiStatus('Max chats per round must be between 1 and 200.');
			setAiSaving(false);
			return;
		}
		if (
			!Number.isFinite(aiSettings.whatsapp_recovery_analysis_message_limit) ||
			aiSettings.whatsapp_recovery_analysis_message_limit < 6 ||
			aiSettings.whatsapp_recovery_analysis_message_limit > 80
		) {
			setAiStatus('Past messages for AI must be between 6 and 80.');
			setAiSaving(false);
			return;
		}
		try {
			const response = await fetch('/api/ai-settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(aiSettings),
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || 'Could not save auto-reply settings.');
			}
			setAiSettings({
				ai_enabled: Boolean(data?.data?.ai_enabled),
				ai_prompt: data?.data?.ai_prompt || '',
				ai_blocklist: data?.data?.ai_blocklist || '',
				automation_enabled: data?.data?.automation_enabled !== false,
				whatsapp_pending_recovery_enabled:
					data?.data?.whatsapp_pending_recovery_enabled !== false,
				whatsapp_only_post_config_messages:
					data?.data?.whatsapp_only_post_config_messages !== false,
				whatsapp_preconfig_message_grace_ms: Number.isInteger(
					data?.data?.whatsapp_preconfig_message_grace_ms
				)
					? data.data.whatsapp_preconfig_message_grace_ms
					: 30000,
				whatsapp_recovery_window_hours: Number.isInteger(
					data?.data?.whatsapp_recovery_window_hours
				)
					? data.data.whatsapp_recovery_window_hours
					: 24,
				whatsapp_recovery_batch_limit: Number.isInteger(
					data?.data?.whatsapp_recovery_batch_limit
				)
					? data.data.whatsapp_recovery_batch_limit
					: 20,
				whatsapp_recovery_analysis_message_limit: Number.isInteger(
					data?.data?.whatsapp_recovery_analysis_message_limit
				)
					? data.data.whatsapp_recovery_analysis_message_limit
					: 18,
				whatsapp_recovery_ai_required:
					data?.data?.whatsapp_recovery_ai_required !== false,
				whatsapp_recovery_ai_model: data?.data?.whatsapp_recovery_ai_model || '',
				appointment_start_hour: Number.isInteger(data?.data?.appointment_start_hour)
					? data.data.appointment_start_hour
					: 9,
				appointment_end_hour: Number.isInteger(data?.data?.appointment_end_hour)
					? data.data.appointment_end_hour
					: 20,
				appointment_slot_minutes: Number.isInteger(data?.data?.appointment_slot_minutes)
					? data.data.appointment_slot_minutes
					: 60,
				appointment_window_months: Number.isInteger(data?.data?.appointment_window_months)
					? data.data.appointment_window_months
					: 3,
			});
			setAiStatus('Auto-reply settings saved.');
			setTimeout(() => setAiStatus(''), 2000);
		} catch (error) {
			setAiStatus(error.message || 'Could not save auto-reply settings.');
		} finally {
			setAiSaving(false);
		}
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-[50vh]">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-aa-orange mx-auto mb-4"></div>
					<p className="text-gray-600">Loading dashboard...</p>
				</div>
			</div>
		);
	}

	const overviewData = OVERVIEW_METRICS.map((metric) => ({
		name: metric.name,
		value: toCount(stats?.[metric.key]),
	})).filter((metric) => metric.value > 0 || ['Users', 'Messages', 'Requirements', 'Open Needs'].includes(metric.name));

	const growthTrendData = Array.isArray(stats?.growth_trend) && stats.growth_trend.length > 0
		? stats.growth_trend.map((point) => ({
			name: point?.label || point?.date || '',
			value: toCount(point?.value),
		}))
		: overviewData;

	const recentMessages = messages.slice(0, 5);
  const showOrders = Boolean(user?.id) && hasProductAccess(user);
  const showAppointments = Boolean(user?.id) && hasAppointmentAccess(user);

	return (
		<div className="p-4 sm:p-6 space-y-6">
			{/* Header */}
			<div>
				<h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">Dashboard</h1>
				<p className="text-gray-600 mt-2">Welcome back! Here&apos;s your business overview.</p>
			</div>

			{/* Quick Actions */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {showAppointments && (
				  <div className="bg-white p-4 sm:p-6 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition">
					  <div className="flex items-start justify-between gap-4">
						  <div>
							  <p className="text-xs uppercase text-gray-500 font-semibold">Booking</p>
							  <h3 className="text-lg font-bold text-gray-900 mt-2">Manage bookings</h3>
							  <p className="text-sm text-gray-600 mt-1">Review and update upcoming bookings.</p>
						  </div>
						  <FontAwesomeIcon icon={faCalendarCheck} className="text-aa-orange" style={{ fontSize: 32 }} />
					  </div>
					  <button
						  onClick={() => router.push('/appointments')}
						  className="mt-4 w-full rounded-full border border-aa-orange text-aa-orange font-semibold px-4 py-2 hover:bg-aa-orange hover:text-white transition"
					  >
						  Open bookings
					  </button>
				  </div>
        )}

        {showAppointments && (
				  <div className="bg-white p-4 sm:p-6 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition">
					  <div className="flex items-start justify-between gap-4">
						  <div>
							  <p className="text-xs uppercase text-gray-500 font-semibold">Create</p>
							  <h3 className="text-lg font-bold text-gray-900 mt-2">Create appointment</h3>
							  <p className="text-sm text-gray-600 mt-1">Add a new appointment in seconds.</p>
						  </div>
						  <FontAwesomeIcon icon={faCalendarPlus} className="text-green-500" style={{ fontSize: 32 }} />
					  </div>
					  <button
						  onClick={() => router.push('/appointments?new=1')}
						  className="mt-4 w-full rounded-full bg-aa-dark-blue text-white font-semibold px-4 py-2 hover:bg-aa-dark-blue/90 transition"
					  >
						  Create appointment
					  </button>
				  </div>
        )}

        {showOrders && (
				  <div className="bg-white p-4 sm:p-6 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition">
					  <div className="flex items-start justify-between gap-4">
						  <div>
							  <p className="text-xs uppercase text-gray-500 font-semibold">Orders</p>
							  <h3 className="text-lg font-bold text-gray-900 mt-2">Place order</h3>
							  <p className="text-sm text-gray-600 mt-1">Track new WhatsApp orders fast.</p>
						  </div>
						  <FontAwesomeIcon icon={faCartShopping} className="text-blue-500" style={{ fontSize: 32 }} />
					  </div>
					  <button
						  onClick={() => router.push('/orders')}
						  className="mt-4 w-full rounded-full border border-aa-dark-blue text-aa-dark-blue font-semibold px-4 py-2 hover:bg-aa-dark-blue hover:text-white transition"
					  >
						  Go to orders
					  </button>
				  </div>
        )}
			</div>

			{/* Stats Grid */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<div className="bg-white p-4 sm:p-6 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-gray-600 text-sm font-medium">Total Users</p>
							<h3 className="text-3xl font-bold text-gray-900 mt-1">{stats?.total_users || 0}</h3>
						</div>
						<FontAwesomeIcon icon={faUsers} className="text-aa-orange" style={{ fontSize: 40 }} />
					</div>
				</div>

				<div className="bg-white p-4 sm:p-6 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-gray-600 text-sm font-medium">Incoming Messages</p>
							<h3 className="text-3xl font-bold text-gray-900 mt-1">{stats?.incoming_messages || 0}</h3>
						</div>
						<FontAwesomeIcon icon={faMessage} className="text-blue-500" style={{ fontSize: 40 }} />
					</div>
				</div>

				<div className="bg-white p-4 sm:p-6 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-gray-600 text-sm font-medium">Active Requirements</p>
							<h3 className="text-3xl font-bold text-gray-900 mt-1">{stats?.active_requirements || 0}</h3>
						</div>
						<FontAwesomeIcon icon={faCircleCheck} className="text-green-500" style={{ fontSize: 40 }} />
					</div>
				</div>

				<div className="bg-white p-4 sm:p-6 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-gray-600 text-sm font-medium">Open Needs</p>
							<h3 className="text-3xl font-bold text-gray-900 mt-1">{stats?.open_needs || 0}</h3>
						</div>
						<FontAwesomeIcon icon={faCircleExclamation} className="text-aa-orange" style={{ fontSize: 40 }} />
					</div>
				</div>
			</div>

			{/* Charts Row */}
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<div className="bg-white p-4 sm:p-6 rounded-lg border border-gray-200 shadow-sm">
						<h2 className="text-xl font-bold text-gray-900 mb-4">Overview</h2>
						<ResponsiveContainer width="100%" height={300}>
							<BarChart data={overviewData}>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis dataKey="name" />
								<YAxis />
								<Tooltip />
								<Bar dataKey="value" fill="#FF6B35" radius={[8, 8, 0, 0]} />
						</BarChart>
					</ResponsiveContainer>
				</div>

					<div className="bg-white p-4 sm:p-6 rounded-lg border border-gray-200 shadow-sm">
						<h2 className="text-xl font-bold text-gray-900 mb-4">Growth Trend</h2>
						<ResponsiveContainer width="100%" height={300}>
							<LineChart data={growthTrendData}>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis
									dataKey="name"
									interval={Math.max(0, Math.ceil(growthTrendData.length / 8) - 1)}
									angle={growthTrendData.length > 10 ? -30 : 0}
									textAnchor={growthTrendData.length > 10 ? 'end' : 'middle'}
									height={growthTrendData.length > 10 ? 60 : 30}
								/>
								<YAxis />
								<Tooltip />
								<Line type="monotone" dataKey="value" stroke="#FF6B35" strokeWidth={2} dot={{ fill: '#FF6B35', r: 5 }} />
							</LineChart>
						</ResponsiveContainer>
				</div>
			</div>

			{/* Recent Activity */}
			<div className="bg-white p-4 sm:p-6 rounded-lg border border-gray-200 shadow-sm">
				<h2 className="text-xl font-bold text-gray-900 mb-4">Recent Messages</h2>
				<div className="space-y-3">
					{recentMessages.length === 0 ? (
						<p className="text-gray-500 text-center py-8">No recent messages</p>
					) : (
						recentMessages.map((msg) => (
							<div key={msg.id} className="flex items-start gap-3 pb-3 border-b last:border-b-0">
								<div className="w-10 h-10 rounded-full bg-aa-orange/20 flex items-center justify-center flex-shrink-0">
									<span className="text-sm font-semibold text-aa-orange">{msg.user_name?.charAt(0) || 'U'}</span>
								</div>
								<div className="flex-1">
									<p className="font-semibold text-gray-900">{msg.user_name || 'Unknown'}</p>
									<p className="text-sm text-gray-600">{msg.message_text}</p>
									<p className="text-xs text-gray-500 mt-1">{new Date(msg.created_at).toLocaleString()}</p>
								</div>
								<span className={`text-xs px-2 py-1 rounded ${
									msg.message_type === 'incoming' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
								}`}>
									{msg.message_type}
								</span>
							</div>
						))
					)}
				</div>
			</div>

			{/* AI Reply Controls */}
			<div className="bg-white p-4 sm:p-6 rounded-lg border border-gray-200 shadow-sm">
				<h2 className="text-xl font-bold text-gray-900 mb-2">WhatsApp Auto Replies</h2>
				<p className="text-gray-600 mb-6">
					Set what auto replies can say on WhatsApp.
				</p>
				<p className="text-xs text-gray-500 mb-6">
					To use smart replies, add <span className="font-semibold">OPENROUTER_API_KEY</span> in server settings.
				</p>
				<div className="flex items-center gap-3 mb-6">
					<input
						id="automation-enabled"
						type="checkbox"
						checked={aiSettings.automation_enabled !== false}
						onChange={(e) =>
							setAiSettings((prev) => ({ ...prev, automation_enabled: e.target.checked }))
						}
						className="h-4 w-4"
					/>
					<label htmlFor="automation-enabled" className="text-sm font-semibold text-gray-800">
						Turn on auto replies
					</label>
				</div>
				<div className="flex items-center gap-3 mb-6">
					<input
						id="ai-enabled"
						type="checkbox"
						checked={aiSettings.ai_enabled}
						onChange={(e) =>
							setAiSettings((prev) => ({ ...prev, ai_enabled: e.target.checked }))
						}
						className="h-4 w-4"
					/>
					<label htmlFor="ai-enabled" className="text-sm font-semibold text-gray-800">
						Use smart replies
					</label>
				</div>
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
					<div>
						<label className="block text-sm font-semibold text-gray-800 mb-2">
							What replies can talk about
						</label>
						<textarea
							value={aiSettings.ai_prompt}
							onChange={(e) =>
								setAiSettings((prev) => ({ ...prev, ai_prompt: e.target.value }))
							}
							rows="6"
							placeholder="E.g. booking support, product details, delivery timelines. Keep tone warm and professional."
							className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-aa-orange"
						/>
					</div>
					<div>
						<label className="block text-sm font-semibold text-gray-800 mb-2">
							What replies should avoid
						</label>
						<textarea
							value={aiSettings.ai_blocklist}
							onChange={(e) =>
								setAiSettings((prev) => ({ ...prev, ai_blocklist: e.target.value }))
							}
							rows="6"
							placeholder="E.g. medical advice, legal advice, personal data, payment links."
							className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-aa-orange"
						/>
					</div>
				</div>
				<div className="rounded-lg border border-gray-200 p-4 mb-4">
					<h3 className="text-sm font-semibold text-gray-900 mb-1">Appointment Time Rules</h3>
					<p className="text-xs text-gray-500 mb-4">
						Set your working hours and slot length.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
						<div>
							<label className="block text-xs font-semibold text-gray-700 mb-1">
								Start Time (0-23)
							</label>
							<input
								type="number"
								min="0"
								max="23"
								value={aiSettings.appointment_start_hour}
								onChange={(e) => {
									const next = Number.parseInt(e.target.value, 10);
									if (!Number.isFinite(next)) return;
									setAiSettings((prev) => ({ ...prev, appointment_start_hour: next }));
								}}
								className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-aa-orange"
							/>
						</div>
						<div>
							<label className="block text-xs font-semibold text-gray-700 mb-1">
								End Time (1-24)
							</label>
							<input
								type="number"
								min="1"
								max="24"
								value={aiSettings.appointment_end_hour}
								onChange={(e) => {
									const next = Number.parseInt(e.target.value, 10);
									if (!Number.isFinite(next)) return;
									setAiSettings((prev) => ({ ...prev, appointment_end_hour: next }));
								}}
								className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-aa-orange"
							/>
						</div>
						<div>
							<label className="block text-xs font-semibold text-gray-700 mb-1">
								Each Slot (minutes)
							</label>
							<input
								type="number"
								min="15"
								max="240"
								step="5"
								value={aiSettings.appointment_slot_minutes}
								onChange={(e) => {
									const next = Number.parseInt(e.target.value, 10);
									if (!Number.isFinite(next)) return;
									setAiSettings((prev) => ({ ...prev, appointment_slot_minutes: next }));
								}}
								className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-aa-orange"
							/>
						</div>
						<div>
							<label className="block text-xs font-semibold text-gray-700 mb-1">
								Book Ahead (months)
							</label>
							<input
								type="number"
								min="1"
								max="24"
								value={aiSettings.appointment_window_months}
								onChange={(e) => {
									const next = Number.parseInt(e.target.value, 10);
									if (!Number.isFinite(next)) return;
									setAiSettings((prev) => ({ ...prev, appointment_window_months: next }));
								}}
								className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-aa-orange"
							/>
						</div>
					</div>
				</div>
				<div className="rounded-lg border border-gray-200 p-4 mb-4">
					<h3 className="text-sm font-semibold text-gray-900 mb-1">Old Chat Reply Rules</h3>
					<p className="text-xs text-gray-500 mb-4">
						Choose how old unread chats are handled after WhatsApp connects.
					</p>
					<div className="space-y-3 mb-4">
						<label className="flex items-center gap-3 text-sm text-gray-800">
							<input
								type="checkbox"
								checked={aiSettings.whatsapp_pending_recovery_enabled !== false}
								onChange={(e) =>
									setAiSettings((prev) => ({
										...prev,
										whatsapp_pending_recovery_enabled: e.target.checked,
									}))
								}
								className="h-4 w-4"
							/>
							Check unread messages after WhatsApp connects
						</label>
						<label className="flex items-center gap-3 text-sm text-gray-800">
							<input
								type="checkbox"
								checked={aiSettings.whatsapp_only_post_config_messages !== false}
								onChange={(e) =>
									setAiSettings((prev) => ({
										...prev,
										whatsapp_only_post_config_messages: e.target.checked,
									}))
								}
								className="h-4 w-4"
							/>
							Reply only to messages that came after setup
						</label>
						<label className="flex items-center gap-3 text-sm text-gray-800">
							<input
								type="checkbox"
								checked={aiSettings.whatsapp_recovery_ai_required !== false}
								onChange={(e) =>
									setAiSettings((prev) => ({
										...prev,
										whatsapp_recovery_ai_required: e.target.checked,
									}))
								}
								className="h-4 w-4"
							/>
							Let AI review before sending any old-chat reply
						</label>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
						<div>
							<label className="block text-xs font-semibold text-gray-700 mb-1">
								Before-Setup Buffer (ms)
							</label>
							<input
								type="number"
								min="0"
								max="300000"
								step="1000"
								value={aiSettings.whatsapp_preconfig_message_grace_ms}
								onChange={(e) => {
									const next = Number.parseInt(e.target.value, 10);
									if (!Number.isFinite(next)) return;
									setAiSettings((prev) => ({
										...prev,
										whatsapp_preconfig_message_grace_ms: next,
									}));
								}}
								className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-aa-orange"
							/>
						</div>
						<div>
							<label className="block text-xs font-semibold text-gray-700 mb-1">
								Look-back Time (hours)
							</label>
							<input
								type="number"
								min="1"
								max="168"
								value={aiSettings.whatsapp_recovery_window_hours}
								onChange={(e) => {
									const next = Number.parseInt(e.target.value, 10);
									if (!Number.isFinite(next)) return;
									setAiSettings((prev) => ({
										...prev,
										whatsapp_recovery_window_hours: next,
									}));
								}}
								className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-aa-orange"
							/>
						</div>
						<div>
							<label className="block text-xs font-semibold text-gray-700 mb-1">
								Max Chats per Round
							</label>
							<input
								type="number"
								min="1"
								max="200"
								value={aiSettings.whatsapp_recovery_batch_limit}
								onChange={(e) => {
									const next = Number.parseInt(e.target.value, 10);
									if (!Number.isFinite(next)) return;
									setAiSettings((prev) => ({
										...prev,
										whatsapp_recovery_batch_limit: next,
									}));
								}}
								className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-aa-orange"
							/>
						</div>
						<div>
							<label className="block text-xs font-semibold text-gray-700 mb-1">
								Past Messages for AI
							</label>
							<input
								type="number"
								min="6"
								max="80"
								value={aiSettings.whatsapp_recovery_analysis_message_limit}
								onChange={(e) => {
									const next = Number.parseInt(e.target.value, 10);
									if (!Number.isFinite(next)) return;
									setAiSettings((prev) => ({
										...prev,
										whatsapp_recovery_analysis_message_limit: next,
									}));
								}}
								className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-aa-orange"
							/>
						</div>
					</div>
					<div className="mt-4">
						<label className="block text-xs font-semibold text-gray-700 mb-1">
							AI Model for Old Chats (optional)
						</label>
						<input
							type="text"
							value={aiSettings.whatsapp_recovery_ai_model || ''}
							onChange={(e) =>
								setAiSettings((prev) => ({
									...prev,
									whatsapp_recovery_ai_model: e.target.value,
								}))
							}
							placeholder="e.g. google/gemini-2.0-flash-001"
							className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-aa-orange"
						/>
					</div>
				</div>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
					<button
						onClick={saveAiSettings}
						disabled={aiSaving}
						className="px-5 py-2 rounded-full bg-aa-orange text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
					>
						{aiSaving ? 'Saving...' : 'Save Auto-Reply Settings'}
					</button>
					{aiStatus && (
						<span className={`text-sm font-semibold ${aiStatus.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
							{aiStatus}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
