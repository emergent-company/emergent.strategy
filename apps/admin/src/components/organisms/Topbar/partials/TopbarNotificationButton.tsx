import React from 'react'
import { NotificationBell } from '@/components/molecules/NotificationBell'
import { useNavigate } from 'react-router'

export const TopbarNotificationButton: React.FC = () => {
    const navigate = useNavigate()

    const handleViewAll = () => {
        navigate('/admin/notifications')
    }

    return <NotificationBell onViewAll={handleViewAll} />
}

export default TopbarNotificationButton
