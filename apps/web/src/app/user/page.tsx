'use client';

import { useAppContext } from '../../context/AppContext';
import { UserPortal } from '../../components/UserPortal';

export default function UserPage() {
  const {
    users,
    activeSimulatedUserId,
    setActiveSimulatedUserId,
    isDeviceOnline,
    setIsDeviceOnline,
    fetchTenantsAndUsers,
    addToast,
  } = useAppContext();

  return (
    <UserPortal
      users={users}
      activeUserId={activeSimulatedUserId}
      onActiveUserChange={(userId) => setActiveSimulatedUserId(userId)}
      isDeviceOnline={isDeviceOnline}
      onToggleDeviceOnline={(online) => setIsDeviceOnline(online)}
      onPreferencesUpdated={fetchTenantsAndUsers}
      onToast={addToast}
    />
  );
}
