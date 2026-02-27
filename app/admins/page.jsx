'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserPen, faRotateRight, faUserShield, faUserTie, faCircleCheck, faBan } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../components/auth/AuthProvider.jsx';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import Badge from '../components/common/Badge.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import Input from '../components/common/Input.jsx';

export default function AdminsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editForm, setEditForm] = useState({
    id: null,
    name: '',
    email: '',
    phone: '',
    admin_tier: 'client_admin',
    status: 'active',
    business_category: '',
    business_type: 'both',
    access_duration_value: '',
    access_duration_unit: 'days',
    access_expires_at: null,
  });

  useEffect(() => {
    if (!authLoading && user && user.admin_tier !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || user.admin_tier !== 'super_admin') return;
    fetchAdmins();
  }, [user]);

  const fetchAdmins = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admins', { credentials: 'include' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load admins');
      }
      setAdmins(data.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load admins');
    } finally {
      setLoading(false);
    }
  };

  const updateAdmin = async (adminId, payload) => {
    setUpdatingId(adminId);
    setError('');
    try {
      const response = await fetch(`/api/admins/${adminId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update admin');
      }
      setAdmins((prev) =>
        prev.map((admin) => (admin.id === adminId ? data.data : admin))
      );
      return { ok: true };
    } catch (err) {
      setError(err.message || 'Failed to update admin');
      return { ok: false, error: err };
    } finally {
      setUpdatingId(null);
    }
  };

  const openEdit = (admin) => {
    setEditError('');
    setEditForm({
      id: admin.id,
      name: admin.name || '',
      email: admin.email || '',
      phone: admin.phone || '',
      admin_tier: admin.admin_tier || 'client_admin',
      status: admin.status || 'active',
      business_category: admin.business_category || '',
      business_type: admin.business_type || 'both',
      access_duration_value: '',
      access_duration_unit: 'days',
      access_expires_at: admin.access_expires_at || null,
    });
    setEditOpen(true);
  };

  const handleEditChange = (field) => (event) => {
    setEditForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const saveEdit = async () => {
    if (!editForm.id) return;
    setEditSaving(true);
    setEditError('');
    try {
      const result = await updateAdmin(editForm.id, {
        admin_tier: editForm.admin_tier,
        status: editForm.status,
        business_category: editForm.business_category,
        business_type: editForm.business_type,
        access_duration_value:
          editForm.access_duration_value === ''
            ? (editForm.status === 'active' ? 0 : undefined)
            : Number(editForm.access_duration_value),
        access_duration_unit: editForm.access_duration_unit,
      });
      if (!result.ok) {
        throw result.error || new Error('Failed to update admin');
      }
      setEditOpen(false);
    } catch (err) {
      setEditError(err.message || 'Failed to update admin');
    } finally {
      setEditSaving(false);
    }
  };

  const toggleStatus = async (admin) => {
    const nextStatus = admin.status === 'active' ? 'inactive' : 'active';
    const result = await updateAdmin(
      admin.id,
      nextStatus === 'active'
        ? { status: nextStatus, access_duration_value: 0, access_duration_unit: 'days' }
        : { status: nextStatus }
    );
    if (!result.ok) {
      setEditError(result.error?.message || 'Failed to update admin');
    }
  };

  const deleteAdmin = async (admin) => {
    if (!admin?.id) return;
    const label = admin.name || admin.email || admin.phone || `Admin #${admin.id}`;
    const confirmed = window.confirm(
      `Delete ${label}? This permanently removes the admin and all associated data (contacts, messages, orders, appointments, catalog, broadcasts, templates).`
    );
    if (!confirmed) return;
    setDeletingId(admin.id);
    setError('');
    try {
      const response = await fetch(`/api/admins/${admin.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete admin');
      }
      setAdmins((prev) => prev.filter((item) => item.id !== admin.id));
    } catch (err) {
      setError(err.message || 'Failed to delete admin');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredAdmins = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return admins;
    return admins.filter((admin) =>
      [admin.name, admin.email, admin.phone, admin.admin_tier, admin.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [admins, search]);

  const totalCount = admins.length;
  const superCount = admins.filter((admin) => admin.admin_tier === 'super_admin').length;
  const activeCount = admins.filter((admin) => admin.status === 'active').length;
  const roleColors = {
    super_admin: 'blue',
    client_admin: 'orange',
  };
  const roleOptions = [
    { value: 'super_admin', label: 'Super Admin', icon: faUserShield },
    { value: 'client_admin', label: 'Admin', icon: faUserTie },
  ];
  const statusOptions = [
    { value: 'active', label: 'Active', icon: faCircleCheck, tone: 'bg-green-50 text-green-700 border-green-200' },
    { value: 'inactive', label: 'Inactive', icon: faBan, tone: 'bg-gray-100 text-gray-700 border-gray-200' },
  ];
  const businessTypeOptions = [
    { value: 'both', label: 'Products + Services' },
    { value: 'product', label: 'Products' },
    { value: 'service', label: 'Services' },
  ];

  if (authLoading || (user && user.admin_tier !== 'super_admin')) {
    return null;
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader size="lg" text="Loading admins..." />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admins-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-aa-dark-blue mb-2">Admins</h1>
          <p className="text-aa-gray">Manage your admin members and their roles</p>
        </div>
        <Button
          variant="primary"
          icon={<FontAwesomeIcon icon={faRotateRight} style={{ fontSize: 18 }} />}
          className="w-full sm:w-auto"
          onClick={fetchAdmins}
        >
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <h3 className="text-sm font-semibold text-aa-gray mb-2">Total Admins</h3>
          <p className="text-3xl font-bold text-aa-dark-blue">{totalCount}</p>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-aa-gray mb-2">Super Admins</h3>
          <p className="text-3xl font-bold text-aa-orange">{superCount}</p>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-aa-gray mb-2">Active</h3>
          <p className="text-3xl font-bold text-green-600">{activeCount}</p>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Input
          placeholder="Search by name, email, phone, role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAdmins.length === 0 ? (
          <Card>
            <p className="text-aa-gray text-sm">No admins found.</p>
          </Card>
        ) : (
          filteredAdmins.map((admin) => (
            <Card key={admin.id} data-testid={`admin-card-${admin.id}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-aa-dark-blue flex items-center justify-center">
                    <span className="text-white font-bold text-xl">
                      {admin.name?.charAt(0) || 'A'}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-aa-dark-blue">{admin.name || 'Unnamed'}</h3>
                    <Badge variant={roleColors[admin.admin_tier] || 'default'}>
                      {admin.admin_tier === 'super_admin' ? 'Super Admin' : 'Admin'}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="text-sm text-aa-gray">{admin.email || '—'}</div>
                <div className="text-sm text-aa-gray">{admin.phone || '—'}</div>
                <div className="text-sm text-aa-gray">
                  Business: {admin.business_category || 'General'} ({admin.business_type || 'both'})
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${admin.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                  <span className="text-sm text-aa-gray">
                    {admin.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {admin.access_expires_at && (
                  <div className="text-xs text-aa-gray">
                    Access until: {new Date(admin.access_expires_at).toLocaleString()}
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  className="flex-1 text-sm py-2"
                  onClick={() => openEdit(admin)}
                  disabled={updatingId === admin.id}
                >
                  <FontAwesomeIcon icon={faUserPen} />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1 text-sm py-2 text-red-600 hover:bg-red-50"
                  onClick={() => toggleStatus(admin)}
                  disabled={updatingId === admin.id}
                >
                  {admin.status === 'active' ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
              <Button
                variant="ghost"
                className="mt-2 w-full text-sm py-2 text-red-700 hover:bg-red-50"
                onClick={() => deleteAdmin(admin)}
                disabled={deletingId === admin.id || admin.id === user?.id}
              >
                {deletingId === admin.id ? 'Deleting...' : 'Delete Admin'}
              </Button>
            </Card>
          ))
        )}
      </div>

      <Modal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Admin"
        size="md"
      >
        <div className="space-y-4">
          {editError && <p className="text-sm text-red-600">{editError}</p>}
          <Input label="Name" value={editForm.name} onChange={handleEditChange('name')} disabled />
          <Input label="Email" value={editForm.email} onChange={handleEditChange('email')} disabled />
          <Input label="Phone" value={editForm.phone} onChange={handleEditChange('phone')} disabled />

          <div>
            <label className="block text-sm font-semibold text-aa-text-dark mb-2">Role</label>
            <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-gray-200 bg-white p-1">
              {roleOptions.map((option) => {
                const active = editForm.admin_tier === option.value;
                const disablePromoteToSuper =
                  option.value === 'super_admin' &&
                  editForm.id !== user?.id &&
                  editForm.admin_tier !== 'super_admin' &&
                  superCount >= 2;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      if (disablePromoteToSuper) return;
                      setEditForm((prev) => ({ ...prev, admin_tier: option.value }));
                    }}
                    disabled={disablePromoteToSuper}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      active
                        ? 'bg-aa-dark-blue text-white'
                        : disablePromoteToSuper
                          ? 'text-aa-gray/50 cursor-not-allowed'
                          : 'text-aa-gray hover:text-aa-dark-blue'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <FontAwesomeIcon icon={option.icon} />
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <Input
            label="Business Category"
            value={editForm.business_category}
            onChange={handleEditChange('business_category')}
            placeholder="Retail, Shop, Clinic..."
          />

          <div>
            <label className="block text-sm font-semibold text-aa-text-dark mb-2">Business Type</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {businessTypeOptions.map((option) => {
                const active = editForm.business_type === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setEditForm((prev) => ({ ...prev, business_type: option.value }))
                    }
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      active
                        ? 'border-aa-orange bg-aa-orange/10 text-aa-dark-blue'
                        : 'border-gray-200 text-aa-gray hover:border-aa-orange hover:text-aa-orange'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-aa-text-dark mb-2">Status</label>
            <div className="grid grid-cols-2 gap-2">
              {statusOptions.map((option) => {
                const active = editForm.status === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setEditForm((prev) => ({ ...prev, status: option.value }))
                    }
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? option.tone
                        : 'border-gray-200 text-aa-gray hover:border-aa-orange hover:text-aa-orange'
                    }`}
                  >
                    <span>{option.label}</span>
                    <FontAwesomeIcon icon={option.icon} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-semibold text-aa-text-dark mb-2">Access Timer (optional)</p>
            <p className="text-xs text-aa-gray mb-3">
              Set how long this admin stays active. Leave empty for no expiry.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Duration"
                type="number"
                value={editForm.access_duration_value}
                onChange={handleEditChange('access_duration_value')}
                placeholder="30"
              />
              <div>
                <label className="block text-sm font-semibold text-aa-text-dark mb-2">Unit</label>
                <select
                  value={editForm.access_duration_unit}
                  onChange={handleEditChange('access_duration_unit')}
                  className="w-full rounded-lg border-2 border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-aa-orange sm:py-3 sm:text-base"
                >
                  <option value="days">Days</option>
                  <option value="months">Months</option>
                </select>
              </div>
            </div>
            {editForm.access_expires_at && (
              <p className="mt-2 text-xs text-aa-gray">
                Current expiry: {new Date(editForm.access_expires_at).toLocaleString()}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveEdit} disabled={editSaving}>
              {editSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
