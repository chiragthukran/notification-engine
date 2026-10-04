'use client';

import { useAppContext } from '../../context/AppContext';
import { TenantPortal } from '../../components/TenantPortal';

export default function TenantPage() {
  const {
    tenants,
    users,
    stats,
    activeSimulatedUserId,
    setActiveSimulatedUserId,
    fetchStats,
    fetchTenantsAndUsers,
  } = useAppContext();

  const handleManualNotificationSent = () => {
    fetchStats();
    fetchTenantsAndUsers();
  };

  return (
    <TenantPortal
      tenants={tenants}
      users={users}
      onNotificationSent={handleManualNotificationSent}
      recentNotifications={stats?.recentNotifications || []}
      activeSimulatedUserId={activeSimulatedUserId}
      onSelectRecipient={(userId) => setActiveSimulatedUserId(userId)}
    />
  );
}
