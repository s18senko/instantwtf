
// Конфигурация
const BASE_URL = 'https://instant.run.place';

// Состояние приложения
let currentUser = null;

// Элементы DOM
const navLinks = document.querySelectorAll('.nav-link');
const pages = document.querySelectorAll('.page');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const logoutBtn = document.getElementById('logout-btn');
const downloadLoaderBtn = document.getElementById('download-loader');
const headerProfile = document.getElementById('header-profile');

async function updateStatus() {
    try {
        const response = await fetch(`${BASE_URL}/api/v1/status`);
        const data = await response.json();
        
        // Обновляем данные на странице
        document.querySelector('#status-page .progress[data-type="memory"]').style.width = `${data.memoryUsage}%`;
        document.querySelector('#status-page p[data-type="memory"]').textContent = `${data.memoryUsage}%`;
        
        document.querySelector('#status-page .progress[data-type="cpu"]').style.width = `${data.cpuUsage}%`;
        document.querySelector('#status-page p[data-type="cpu"]').textContent = `${data.cpuUsage}%`;
        
        document.querySelector('#status-page .progress[data-type="network"]').style.width = `${Math.min(data.networkUsage / 10, 100)}%`;
        document.querySelector('#status-page p[data-type="network"]').textContent = `${data.networkUsage} KB/s`;
        
    } catch (error) {
        console.error('Status update error:', error);
    }
}

// Добавим интервал обновления статуса
let statusInterval;
document.querySelector('[data-page="status"]').addEventListener('click', () => {
    updateStatus();
    statusInterval = setInterval(updateStatus, 5000); // Обновляем каждые 5 секунд
});

// Останавливаем обновление при переходе на другие страницы
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        if (link.getAttribute('data-page') !== 'status' && statusInterval) {
            clearInterval(statusInterval);
        }
    });
});

// Навигация
navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const pageId = link.getAttribute('data-page') + '-page';
        
        // Проверка авторизации
        if ((pageId === 'shop-page' || pageId === 'profile-page' || pageId === 'support-page' || pageId === 'admin-page') && !currentUser) {
            showAuthPage('login');
            return;
        }
        
        // Проверка роли для админки
        if (pageId === 'admin-page' && currentUser?.role !== 'Admin') {
            showCustomAlert('Доступ запрещен. Требуются права администратора.');
            return;
        }
        
        // Переключение страниц
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        pages.forEach(page => page.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
    });
});

document.querySelector('[data-page="shop"]').addEventListener('click', () => {
    if (currentUser) {
        // Удаляем предыдущее отображение баланса, если оно есть
        const existingBalance = document.querySelector('#shop-page .user-balance');
        if (existingBalance) existingBalance.remove();
        
        // Добавляем отображение баланса
        document.querySelector('#shop-page h2').insertAdjacentHTML('afterend', 
            `<p class="user-balance">Ваш баланс: <strong>${currentUser.balance} ₽</strong></p>`);
    }
});

// Обработчики покупки подписки с подтверждением
document.querySelectorAll('[data-product]').forEach(button => {
    button.addEventListener('click', async (e) => {
        if (!currentUser) {
            showAuthPage('login');
            return;
        }

        const productId = e.target.getAttribute('data-product');
        let productName, productPrice;
        
        // Определяем информацию о продукте
        switch(productId) {
            case 'rust_1_month':
                productName = '1 месяц подписки';
                productPrice = 500;
                break;
            case 'rust_3_month':
                productName = '3 месяца подписки';
                productPrice = 1200;
                break;
            case 'rust_6_month':
                productName = '6 месяцев подписки';
                productPrice = 2000;
                break;
        }
        
        // Проверяем баланс
        if (currentUser.balance < productPrice) {
            showCustomAlert(
                'Недостаточно средств', 
                `Требуется: ${productPrice} ₽<br>Доступно: ${currentUser.balance} ₽`,
                'error'
            );
            return;
        }
        
        // Создаем модальное окно подтверждения
        const modalHTML = `
            <div class="modal-overlay" id="confirm-purchase-modal">
                <div class="modal-content">
                    <h3>Подтверждение покупки</h3>
                    <div class="modal-body">
                        <p>Вы уверены, что хотите приобрести:</p>
                        <div class="product-info">
                            <h4>${productName}</h4>
                            <p class="price">${productPrice} ₽</p>
                        </div>
                        <p class="balance-info">Ваш баланс: <strong>${currentUser.balance} ₽</strong></p>
                        <p class="after-purchase">После покупки: <strong>${currentUser.balance - productPrice} ₽</strong></p>
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-outline" id="cancel-purchase">Отмена</button>
                        <button class="btn btn-primary" id="confirm-purchase">Подтвердить</button>
                    </div>
                </div>
            </div>
        `;
        
        // Вставляем модальное окно в DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Обработчики для кнопок модального окна
        document.getElementById('cancel-purchase').addEventListener('click', () => {
            document.getElementById('confirm-purchase-modal').remove();
        });
        
        document.getElementById('confirm-purchase').addEventListener('click', async () => {
            const modal = document.getElementById('confirm-purchase-modal');
            modal.querySelector('.modal-content').innerHTML = `
                <div class="loading-spinner">
                    <div class="spinner"></div>
                    <p>Обработка покупки...</p>
                </div>
            `;
            
            try {
                const response = await apiRequest('/api/v1/shop_', 'POST', {
                    action: 'buy_product',
                    username: currentUser.username,
                    token: currentUser.token,
                    product_id: productId
                });

                if (response.status === 'Success') {
                    // Обновляем данные пользователя
                    currentUser.token = response.new_token;
                    currentUser.balance = response.new_balance;
                    currentUser.subscriptionExpiry = response.new_subscription_expiry;
                    
                    // Сохраняем новый токен
                    localStorage.setItem('userToken', response.new_token);
                    
                    // Закрываем модальное окно
                    modal.remove();
                    
                    // Обновляем UI
                    updateUserInfo();
                    
                    // Показываем уведомление об успешной покупке
                    showSuccessAlert(
                        'Покупка завершена',
                        `Подписка "${productName}" успешно приобретена!<br>Новый баланс: ${currentUser.balance} ₽`
                    );
                } else {
                    modal.remove();
                    showCustomAlert(
                        'Ошибка покупки', 
                        response.error || 'Неизвестная ошибка при покупке',
                        'error'
                    );
                }
            } catch (error) {
                modal.remove();
                showCustomAlert(
                    'Ошибка покупки', 
                    error.message || 'Ошибка при обработке запроса',
                    'error'
                );
                console.error('Purchase error:', error);
            }
        });
    });
});

// Функции для показа красивых алертов
function showCustomAlert(title, message, type = 'info') {
    const alertHTML = `
        <div class="custom-alert ${type}">
            <div class="alert-content">
                <h3>${title}</h3>
                <div class="alert-message">${message}</div>
                <button class="btn btn-primary" id="close-alert">OK</button>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', alertHTML);
    
    document.getElementById('close-alert').addEventListener('click', () => {
        document.querySelector('.custom-alert').remove();
    });
}

function showSuccessAlert(title, message) {
    showCustomAlert(title, message, 'success');
}

document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');
        
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
        document.getElementById(`${tabName}-form`).classList.add('active');
    });
});

// Обработка формы входа
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorElement = document.getElementById('login-error');
    
    // Клиентская валидация
    if (!username || !password) {
        showError(errorElement, 'Заполните имя пользователя и пароль');
        return;
    }
    
    console.log('Sending login request:', { action: 'login', username, password });
    
    try {
        const response = await apiRequest('/api/v1/site', 'POST', {
            action: 'login',
            username,
            password
        });
        
        console.log('Server response:', response);
        
        // Проверяем, является ли response массивом, и берем первый элемент
        const responseData = Array.isArray(response) ? response[0] : response;
        
        if (responseData.status === 'Login successful') {
            currentUser = {
                token: responseData.token,
                username,
                display_name: responseData.display_name,
                avatar: responseData.avatar,
                role: responseData.role,
                balance: responseData.balance,
                subscriptionExpiry: responseData.subscription_expiry,
                isFrozen: responseData.subscription_frozen || false,
                hwid: responseData.hwid,
                unicalId: responseData.unical_id
            };
            
            localStorage.setItem('userToken', responseData.token);
            localStorage.setItem('username', username);
            localStorage.setItem('userData', JSON.stringify(currentUser));
            
            updateUserInfo();
            document.querySelector('[data-page="profile"]').click();
            errorElement.classList.add('hidden');
        } else {
            showError(errorElement, responseData.message || 'Неверные учетные данные');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError(errorElement, error.message || 'Ошибка при входе');
    }
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    const inviteKey = document.getElementById('invite-key').value;
    
    const errorElement = document.getElementById('register-error');
    const successElement = document.getElementById('register-success');
    
    errorElement.classList.add('hidden');
    successElement.classList.add('hidden');
    
    if (!/^[a-zA-Z0-9]{4,}$/.test(username)) {
        showError(errorElement, 'Имя пользователя должно содержать только буквы и цифры (мин. 4 символа)');
        return;
    }
    
    if (password.length < 6) {
        showError(errorElement, 'Пароль должен быть не менее 6 символов');
        return;
    }
    
    if (password !== confirm) {
        showError(errorElement, 'Пароли не совпадают');
        return;
    }
    
    try {
        const response = await apiRequest('/api/v1/site', 'POST', {
            action: 'register',
            username,
            password,
            invite_key: inviteKey
        });
        
        if (response.status === 'Success') {
            successElement.textContent = 'Регистрация успешна! Теперь вы можете войти.';
            successElement.classList.remove('hidden');
            
            registerForm.reset();
            
            document.querySelector('[data-tab="login"]').click();
        } else {
            showError(errorElement, response.message || 'Ошибка при регистрации');
        }
    } catch (error) {
        showError(errorElement, error.message || 'Ошибка при регистрации');
    }
});

logoutBtn.addEventListener('click', async () => {
    try {
        await apiRequest('/api/v1/site', 'POST', { 
            action: 'logout',
            username: currentUser.username,
            token: currentUser.token
        });
        currentUser = null;
        localStorage.removeItem('userToken');
        localStorage.removeItem('username');
        localStorage.removeItem('userData');
        updateUserInfo();
        document.querySelector('[data-page="home"]').click();
    } catch (error) {
        console.error('Logout error:', error);
    }
});

// Скачивание Loader.exe
downloadLoaderBtn.addEventListener('click', async () => {
    if (!currentUser) {
        showCustomAlert('Ошибка', 'Для скачивания необходимо войти в систему', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${BASE_URL}/api/v1/GetUnicalLoader`, {
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Loader.exe';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } else {
            throw new Error('Ошибка при скачивании файла');
        }
    } catch (error) {
        console.error('Download error:', error);
        showCustomAlert('Ошибка', 'Ошибка при скачивании Loader.exe', 'error');
    }
});

// Функция отображения страницы авторизации
function showAuthPage(tab = 'login') {
    pages.forEach(page => page.classList.remove('active'));
    document.getElementById('auth-page').classList.add('active');
    
    navLinks.forEach(l => l.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`${tab}-form`).classList.add('active');
}

function updateUserInfo() {
    if (!headerProfile) {
        console.error('Элемент header-profile не найден');
    }
    if (!currentUser) {
        if (headerProfile) {
            headerProfile.classList.add('hidden');
        }
        return;
    } else {
        if (headerProfile) {
            headerProfile.classList.remove('hidden');
        }
    }

    const avatarUrl = currentUser.avatar ? 
        `${currentUser.avatar}?${Date.now()}` : 
        null;

    if (headerProfile) {
        const avatarPrev = headerProfile.querySelector('.avatar_prev');
        if (avatarUrl) {
            avatarPrev.style.backgroundImage = `url('${avatarUrl}')`;
            avatarPrev.textContent = '';
        } else {
            avatarPrev.style.backgroundImage = '';
            avatarPrev.textContent = currentUser.username[0].toUpperCase();
        }
        
        document.getElementById('header-username').textContent = 
            currentUser.display_name || currentUser.username;
        document.getElementById('header-user-role').textContent = currentUser.role;
    }

    const profileAvatar = document.querySelector('.profile-header .avatar');
    if (profileAvatar) {
        if (avatarUrl) {
            profileAvatar.style.backgroundImage = `url('${avatarUrl}')`;
            profileAvatar.textContent = '';
        } else {
            profileAvatar.style.backgroundImage = '';
            profileAvatar.textContent = currentUser.username[0].toUpperCase();
        }
    }

    document.getElementById('user-name').textContent = currentUser.display_name || currentUser.username;
    document.getElementById('user-role').textContent = currentUser.role;
    document.getElementById('user-balance').textContent = `${currentUser.balance} ₽`;
    document.getElementById('user-hwid').textContent = currentUser.hwid || 'Не установлен';
    document.getElementById('user-unical').textContent = currentUser.unicalId;
    document.getElementById('user-subscription').textContent = 
        formatSubscriptionDate(currentUser.subscriptionExpiry);

    const statusElement = document.getElementById('subscription-status');
    if (statusElement) {
        if (currentUser.isFrozen) {
            statusElement.textContent = 'Статус: заморожена';
            statusElement.style.color = '#ffcc00';
        } else {
            statusElement.textContent = 'Статус: активна';
            statusElement.style.color = '#4CAF50';
        }
    }

    const unfreezeBtn = document.getElementById('unfreeze-btn');
    const freezeBtn = document.getElementById('freeze-btn');
    if (currentUser.isFrozen) {
        unfreezeBtn.style.display = 'block';
        freezeBtn.style.display = 'none';
    } else {
        unfreezeBtn.style.display = 'none';
        freezeBtn.style.display = 'block';
    }
}

function formatSubscriptionDate(timestamp) {
    if (!timestamp) return 'Не активна';
    
    const expiryDate = new Date(timestamp * 1000);
    const now = new Date();
    
    if (expiryDate < now) {
        return 'Истекла';
    }
    
    const diffTime = expiryDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return `${diffDays} дней`;
}

// Универсальная функция для запросов к API
async function apiRequest(endpoint, method = 'POST', data = null) {
    const url = `${BASE_URL}${endpoint}`;
    
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(url, options);
        const textResponse = await response.text();
        
        if (!response.ok) {
            throw new Error(`API error ${response.status}: ${textResponse}`);
        }
        
        try {
            return JSON.parse(textResponse);
        } catch (e) {
            console.error('JSON parse error:', e, 'Response:', textResponse);
            throw new Error('Invalid JSON response');
        }
    } catch (error) {
        console.error('API request error:', error);
        throw error;
    }
}

// Показать ошибку
function showError(element, message) {
    if (element) {
        console.log('Showing error:', message);
        element.textContent = message;
        element.classList.remove('hidden');
    } else {
        console.error('Error element not found');
        showCustomAlert('Ошибка', message, 'error');
    }
}

// Проверка авторизации при загрузке
async function checkAuth() {
    const token = localStorage.getItem('userToken');
    const username = localStorage.getItem('username');
    if (!token || !username) return;
    
    try {
        const validationResponse = await apiRequest('/api/v1/site', 'POST', {
            action: 'validate_token',
            username: username,
            token: token
        });
        
        if (validationResponse.status === 'Success') {
            const userResponse = await apiRequest('/api/v1/site', 'POST', {
                action: 'get_user_data',
                username: username,
                token: token
            });
            
            if (userResponse.status === 'Success') {
                currentUser = {
                    token: token,
                    username: username,
                    display_name: userResponse.display_name,
                    avatar: userResponse.avatar,
                    role: userResponse.role,
                    balance: userResponse.balance,
                    subscriptionExpiry: userResponse.subscription_expiry,
                    isFrozen: userResponse.subscription_frozen || false,
                    hwid: userResponse.hwid,
                    unicalId: userResponse.unical_id
                };
                
                localStorage.setItem('userData', JSON.stringify(currentUser));
                updateUserInfo();
            }
        }
    } catch (error) {
        console.error('Auth check error:', error);
        localStorage.removeItem('userToken');
        localStorage.removeItem('username');
        localStorage.removeItem('userData');
    }
}

// Заморозка подписки
document.getElementById('freeze-btn').addEventListener('click', async () => {
    if (!currentUser) return;
    
    try {
        const response = await apiRequest('/api/v1/site', 'POST', {
            action: 'freeze_subscription',
            username: currentUser.username,
            token: currentUser.token
        });
        
        if (response.status === 'Success') {
            currentUser.isFrozen = true;
            updateUserInfo();
            showNotification('Подписка заморожена!');
        }
    } catch (error) {
        console.error('Freeze error:', error);
        showCustomAlert('Ошибка', 'Ошибка при заморозке подписки: ' + error.message, 'error');
    }
});

// Разморозка подписки
document.getElementById('unfreeze-btn').addEventListener('click', async () => {
    if (!currentUser) return;
    
    try {
        const response = await apiRequest('/api/v1/site', 'POST', {
            action: 'unfreeze_subscription',
            username: currentUser.username,
            token: currentUser.token
        });
        
        if (response.status === 'Success') {
            currentUser.isFrozen = false;
            updateUserInfo();
            showNotification('Подписка разморожена!');
        }
    } catch (error) {
        console.error('Unfreeze error:', error);
        showCustomAlert('Ошибка', 'Ошибка при разморозке подписки: ' + error.message, 'error');
    }
});

// Генерация хеша
const generateBtn = document.getElementById('generate-hash');
if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
        if (!currentUser) {
            showCustomAlert('Ошибка', 'Пользователь не авторизован', 'error');
            return;
        }
        
        try {
            const response = await apiRequest('/api/v1/site', 'POST', {
                action: 'generate_hash',
                username: currentUser.username,
                token: currentUser.token
            });
            
            if (response.status === 'Success' && response.user_hash) {
                await navigator.clipboard.writeText(response.user_hash);
                showNotification('Хэш скопирован в буфер обмена!');
            } else {
                showCustomAlert('Ошибка', response.message || 'Ошибка генерации хеша', 'error');
            }
        } catch (error) {
            console.error('Hash generation error:', error);
            showCustomAlert('Ошибка', 'Ошибка при генерации хеша: ' + error.message, 'error');
        }
    });
}
function showNotification(message, type = 'success') {
    // Удаляем старое уведомление если есть
    const oldNotification = document.getElementById('dynamic-notification');
    if (oldNotification) {
        oldNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.id = 'dynamic-notification';
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#f44336' : type === 'warning' ? '#ff9800' : type === 'info' ? '#2196F3' : '#4CAF50'};
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 1000;
        transform: translateX(100%);
        opacity: 0;
        transition: all 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Анимация появления
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
        notification.style.opacity = '1';
    }, 10);
    
    // Автоматическое скрытие
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Обновление профиля
document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const displayName = document.getElementById('display-name').value;
    const avatarUrl = document.getElementById('avatar-url').value;
    
    try {
        const response = await apiRequest('/api/v1/site', 'POST', {
            action: 'update_profile',
            display_name: displayName,
            avatar: avatarUrl,
            username: currentUser.username,
            token: currentUser.token
        });
        
        if (response.status === 'success') {
            currentUser.display_name = displayName;
            currentUser.avatar = avatarUrl;
            
            localStorage.setItem('userData', JSON.stringify(currentUser));
            
            updateUserInfo();
            showNotification('Профиль обновлен!');
            
            await checkAuth();
        }
    } catch (error) {
        console.error('Profile update error:', error);
        showCustomAlert('Ошибка', 'Ошибка обновления: ' + error.message, 'error');
    }
});

// Обработчики админ-панели
document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabId = tab.getAttribute('data-tab');
        
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        document.querySelectorAll('.admin-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`${tabId}-tab`).classList.add('active');
        
        if (tabId === 'users') loadUsersTab();
        else if (tabId === 'keys') loadKeysTab();
        else if (tabId === 'stats') loadStatsTab();
    });
});

// Загрузка данных для вкладки пользователей
async function loadUsersTab() {
    if (!currentUser || currentUser.role !== 'Admin') return;
    
    try {
        const response = await apiRequest('/api/v1/secret/admin/SuperAPI', 'POST', {
            action: 'get_user_list',
            username: currentUser.username,
            token: currentUser.token
        });
        
        // Обработка списка пользователей
    } catch (error) {
        console.error('Failed to load users:', error);
    }
}

// Загрузка списка ключей
async function loadKeysTab() {
    if (!currentUser || currentUser.role !== 'Admin') return;
    
    try {
        const response = await apiRequest('/api/v1/secret/admin/SuperAPI', 'POST', {
            action: 'get_key_list',
            username: currentUser.username,
            token: currentUser.token
        });
        
        if (response.status === 'Success' && response.keys) {
            const keyList = document.getElementById('key-list');
            keyList.innerHTML = '';
            
            response.keys.forEach(key => {
                const keyItem = document.createElement('div');
                keyItem.className = 'key-item';
                keyItem.innerHTML = `
                    <div>
                        <strong>${key.key}</strong>
                        <span class="key-role">${key.role}</span>
                        ${key.used ? '<span class="key-used">(использован)</span>' : '<span class="key-available">(доступен)</span>'}
                    </div>
                    <button class="btn btn-outline copy-key" data-key="${key.key}">Копировать</button>
                `;
                keyList.appendChild(keyItem);
            });
            
            document.querySelectorAll('.copy-key').forEach(btn => {
                btn.addEventListener('click', () => {
                    const key = btn.getAttribute('data-key');
                    navigator.clipboard.writeText(key);
                    showNotification('Ключ скопирован в буфер обмена');
                });
            });
        }
    } catch (error) {
        console.error('Failed to load keys:', error);
        showNotification('Ошибка загрузки ключей', 'error');
    }
}

document.getElementById('generate-key').addEventListener('click', async () => {
    if (!currentUser || currentUser.role !== 'Admin') return;
    
    const role = document.getElementById('key-role').value;
    
    try {
        const response = await apiRequest('/api/v1/secret/admin/SuperAPI', 'POST', {
            action: 'generate_key',
            username: currentUser.username,
            token: currentUser.token,
            role: role
        });

        if (response.status === 'Success') {
            showNotification('Ключ успешно сгенерирован');
            loadKeysList();
        } else {
            throw new Error(response.error || 'Ошибка генерации ключа');
        }
    } catch (error) {
        console.error('Key generation error:', error);
        showNotification(error.message, 'error');
    }
});

// Загрузка статистики
async function loadStatsTab() {
    if (!currentUser || currentUser.role !== 'Admin') return;
    
    try {
        const response = await apiRequest('/api/v1/status', 'GET');
        
        document.getElementById('total-users').textContent = Object.keys(users).length;
        document.getElementById('active-today').textContent = response.users?.today || 0;
        document.getElementById('new-month').textContent = response.users?.month || 0;
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Поиск пользователя
document.getElementById('search-user').addEventListener('click', async () => {
    const username = document.getElementById('user-search').value;
    
    try {
        const response = await apiRequest('/api/v1/secret/admin/SuperAPI', 'POST', {
            action: 'get_user',
            username: currentUser.username,
            token: currentUser.token,
            target_user: username
        });
        
        if (response.status === 'Success') {
            const userDetails = document.getElementById('user-details');
            userDetails.innerHTML = `
                <h3>${response.user.username}</h3>
                <p>Роль: ${response.user.role}</p>
                <p>Баланс: ${response.user.balance} ₽</p>
                <p>Подписка: ${formatSubscriptionDate(response.user.subscription_expiry)}</p>
                <p>Статус: ${response.user.subscription_frozen ? 'Заморожена' : 'Активна'}</p>
            `;
        } else {
            showNotification(response.error || 'Пользователь не найден', 'error');
        }
    } catch (error) {
        console.error('User search error:', error);
    }
});

// Заморозка/разморозка подписки
document.getElementById('freeze-user').addEventListener('click', async () => {
    const username = document.getElementById('user-search').value;
    
    try {
        const response = await apiRequest('/api/v1/secret/admin/SuperAPI', 'POST', {
            action: 'toggle_freeze',
            username: currentUser.username,
            token: currentUser.token,
            target_user: username
        });
        
        if (response.status === 'Success') {
            showNotification('Статус подписки изменен');
            document.getElementById('search-user').click();
        }
    } catch (error) {
        console.error('Freeze toggle error:', error);
    }
});

async function loadUsersList() {
    try {
        showLoader('#users-table');
        
        const response = await apiRequest('/api/v1/secret/admin/SuperAPI', 'POST', {
            action: 'get_user_list',
            username: currentUser.username,
            token: currentUser.token
        });

        if (response.status === 'Success') {
            renderUsersTable(response.users);
        } else {
            throw new Error(response.error || 'Ошибка загрузки пользователей');
        }
    } catch (error) {
        console.error('Failed to load users:', error);
        showErrorNotification('Ошибка загрузки списка пользователей');
    } finally {
        hideLoader();
    }
}

document.getElementById('update-list').addEventListener('click', async () => {
    try {
        showLoader('#users-table');
        
        const response = await apiRequest('/api/v1/secret/admin/SuperAPI', 'POST', {
            action: 'get_user_list',
            username: currentUser.username,
            token: currentUser.token
        });

        if (response.status === 'Success') {
            renderUsersTable(response.users);
        } else {
            throw new Error(response.error || 'Ошибка загрузки пользователей');
        }
    } catch (error) {
        console.error('Failed to load users:', error);
        showErrorNotification('Ошибка загрузки списка пользователей');
    } finally {
        hideLoader();
    }
});

function initErrorModal() {
    const modal = document.getElementById('error-modal');
    const okBtn = document.getElementById('error-ok-btn');
    const closeBtn = document.querySelector('.close-btn');
    
    function hideModal() {
        modal.classList.remove('show');
    }
    
    okBtn.addEventListener('click', hideModal);
    closeBtn.addEventListener('click', hideModal);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            hideModal();
        }
    });
}

document.addEventListener('DOMContentLoaded', initErrorModal);

// Кастомная функция показа ошибки
function showError(title, message, options = {}) {
    const modal = document.getElementById('error-modal');
    const errorTitle = document.getElementById('error-title');
    const errorMessage = document.getElementById('error-message');
    
    errorTitle.textContent = title || 'Ошибка';
    errorMessage.textContent = message || 'Произошла неизвестная ошибка';
    
    modal.className = 'custom-modal error-modal';
    if (options.type === 'warning') {
        modal.classList.add('warning-modal');
    }
    
    modal.classList.add('show');
    
    return new Promise(resolve => {
        const handler = () => {
            modal.removeEventListener('click', handler);
            resolve();
        };
        modal.addEventListener('click', handler);
    });
}

// АДМИН-ПАНЕЛЬ: ПОЛЬЗОВАТЕЛИ
function renderUsersTable(users) {
    const container = document.getElementById('user-details');
    if (!container) return;
    
    container.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Логин</th>
                    <th>Имя</th>
                    <th>Роль</th>
                    <th>Баланс</th>
                    <th>Подписка</th>
                    <th>Действия</th>
                </tr>
            </thead>
            <tbody>
                ${users.map(user => `
                    <tr>
                        <td>${user.uid || '-'}</td>
                        <td>${user.username}</td>
                        <td>${user.display_name || '-'}</td>
                        <td><span class="role-badge ${user.role.toLowerCase()}">${user.role}</span></td>
                        <td>${user.balance} ₽</td>
                        <td>
                            <div class="subscription-info">
                                ${formatSubscriptionDate(user.subscription_expiry)}
                                ${user.subscription_frozen ? '<span class="frozen-badge">Заморожена</span>' : ''}
                            </div>
                        </td>
                        <td>
                            <button class="btn-icon edit-user" data-username="${user.username}" title="Редактировать">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon ban-user" data-username="${user.username}" title="${user.subscription_frozen ? 'Разморозить' : 'Заморозить'}">
                                <i class="fas ${user.subscription_frozen ? 'fa-play' : 'fa-pause'}"></i>
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    document.querySelectorAll('.edit-user').forEach(btn => {
        btn.addEventListener('click', () => showEditUserModal(btn.dataset.username));
    });

    document.querySelectorAll('.ban-user').forEach(btn => {
        btn.addEventListener('click', () => toggleUserSubscription(btn.dataset.username));
    });
}

// АДМИН-ПАНЕЛЬ: КЛЮЧИ
async function loadKeysList() {
    try {
        showLoader('#key-list');
        
        const response = await apiRequest('/api/v1/secret/admin/SuperAPI', 'POST', {
            action: 'get_key_list',
            username: currentUser.username,
            token: currentUser.token
        });

        if (response.status === 'Success') {
            renderKeysTable(response.keys);
        } else {
            throw new Error(response.error || 'Ошибка загрузки ключей');
        }
    } catch (error) {
        console.error('Failed to load keys:', error);
        showErrorNotification('Ошибка загрузки списка ключей');
    } finally {
        hideLoader();
    }
}

function renderKeysTable(keys) {
    const container = document.getElementById('key-list');
    if (!container) return;

    container.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th>Ключ</th>
                    <th>Роль</th>
                    <th>Статус</th>
                    <th>Действия</th>
                </tr>
            </thead>
            <tbody>
                ${keys.map(key => `
                    <tr>
                        <td>${key.key}</td>
                        <td>${key.role}</td>
                        <td>${key.used ? '<span class="badge used">Использован</span>' : '<span class="badge active">Активен</span>'}</td>
                        <td class="actions-cell">
                            <button class="btn-icon copy-key" data-key="${key.key}" title="Копировать">
                                <i class="fas fa-copy"></i>
                            </button>
                            ${!key.used ? `
                            <button class="btn-icon delete-key" data-key="${key.key}" title="Удалить">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                            ` : ''}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    document.querySelectorAll('.copy-key').forEach(btn => {
        btn.addEventListener('click', () => {
            navigator.clipboard.writeText(btn.dataset.key);
            showNotification('Ключ скопирован!');
        });
    });

    document.querySelectorAll('.delete-key').forEach(btn => {
        btn.addEventListener('click', () => {
            if (confirm('Удалить этот ключ?')) {
                deleteKey(btn.dataset.key);
            }
        });
    });
}

async function generateKey() {
    const role = document.getElementById('key-role').value;
    
    if (!role) {
        showErrorNotification('Выберите роль для ключа');
        return;
    }

    try {
        const response = await apiRequest('/api/v1/secret/admin/SuperAPI', 'POST', {
            action: 'generate_key',
            username: currentUser.username,
            token: currentUser.token,
            role: role
        });

        if (response.status === 'Success') {
            showSuccessNotification('Ключ успешно сгенерирован');
            loadKeysList();
        } else {
            throw new Error(response.error || 'Ошибка генерации ключа');
        }
    } catch (error) {
        console.error('Key generation error:', error);
        showErrorNotification(error.message);
    }
}

async function deleteKey(key) {
    try {
        const response = await apiRequest('/api/v1/secret/admin/SuperAPI', 'POST', {
            action: 'delete_key',
            username: currentUser.username,
            token: currentUser.token,
            key: key
        });

        if (response.status === 'Success') {
            showNotification('Ключ успешно удалён', 'success');
            loadKeysList();
        } else {
            throw new Error(response.error || 'Ошибка удаления ключа');
        }
    } catch (error) {
        console.error('Delete key error:', error);
        showNotification(error.message, 'error');
    }
}

// АДМИН-ПАНЕЛЬ: СТАТИСТИКА
async function loadStats() {
    if (!currentUser || currentUser.role !== 'Admin') return;
    
    try {
        const response = await apiRequest('/api/v1/status', 'GET');
        
        document.getElementById('total-users').textContent = response.users?.total || 0;
        document.getElementById('active-today').textContent = response.users?.today || 0;
        document.getElementById('new-month').textContent = response.users?.month || 0;
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
function showLoader(selector) {
    const container = document.querySelector(selector);
    if (container) {
        container.innerHTML = '<div class="loader"><div class="spinner"></div><p>Загрузка данных...</p></div>';
    }
}

function hideLoader() {
    const loader = document.querySelector('.loader');
    if (loader) loader.remove();
}

function showEditUserModal(username) {
    if (!currentUser || currentUser.role !== 'Admin') return;

    apiRequest('/api/v1/secret/admin/SuperAPI', 'POST', {
        action: 'get_user',
        username: currentUser.username,
        token: currentUser.token,
        target_user: username
    }).then(response => {
        if (response.status === 'Success') {
            const user = response.user;
            
            const modalHTML = `
                <div class="custom-modal show" id="edit-user-modal">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Редактирование пользователя: ${username}</h3>
                            <button class="close-btn">&times;</button>
                        </div>
                        <div class="modal-body">
                            <form id="edit-user-form">
                                <div class="form-group">
                                    <label for="edit-display-name">Отображаемое имя</label>
                                    <input type="text" id="edit-display-name" class="form-control" 
                                           value="${user.display_name || ''}">
                                </div>
                                <div class="form-group">
                                    <label for="edit-role">Роль</label>
                                    <select id="edit-role" class="form-control">
                                        <option value="User" ${user.role === 'User' ? 'selected' : ''}>User</option>
                                        <option value="Beta" ${user.role === 'Beta' ? 'selected' : ''}>Beta</option>
                                        <option value="Alpha" ${user.role === 'Alpha' ? 'selected' : ''}>Alpha</option>
                                        <option value="Admin" ${user.role === 'Admin' ? 'selected' : ''}>Admin</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="edit-balance">Баланс (₽)</label>
                                    <input type="number" id="edit-balance" class="form-control" 
                                           value="${user.balance || 0}">
                                </div>
                                <div class="form-group">
                                    <label for="edit-subscription">Подписка (дней)</label>
                                    <input type="number" id="edit-subscription" class="form-control" 
                                           value="${user.subscription_expiry ? Math.floor((user.subscription_expiry - Math.floor(Date.now()/1000)) / 86400) : 0}">
                                </div>
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="edit-frozen" ${user.subscription_frozen ? 'checked' : ''}>
                                        Подписка заморожена
                                    </label>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-outline" id="cancel-edit">Отмена</button>
                            <button class="btn btn-primary" id="save-user-changes">Сохранить</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHTML);

            document.getElementById('cancel-edit').addEventListener('click', () => {
                document.getElementById('edit-user-modal').remove();
            });

            document.querySelector('.close-btn').addEventListener('click', () => {
                document.getElementById('edit-user-modal').remove();
            });

            document.getElementById('save-user-changes').addEventListener('click', async () => {
                const newData = {
                    action: 'update_user',
                    username: currentUser.username,
                    token: currentUser.token,
                    target_user: username,
                    display_name: document.getElementById('edit-display-name').value,
                    role: document.getElementById('edit-role').value,
                    balance: parseInt(document.getElementById('edit-balance').value),
                    subscription_days: parseInt(document.getElementById('edit-subscription').value),
                    subscription_frozen: document.getElementById('edit-frozen').checked
                };

                try {
                    const response = await apiRequest('/api/v1/secret/admin/SuperAPI', 'POST', newData);
                    
                    if (response.status === 'Success') {
                        showNotification('Изменения сохранены!');
                        document.getElementById('edit-user-modal').remove();
                        loadUsersList();
                    } else {
                        showError('Ошибка', response.error || 'Не удалось сохранить изменения');
                    }
                } catch (error) {
                    showError('Ошибка', error.message || 'Ошибка при сохранении изменений');
                }
            });

            document.getElementById('edit-user-modal').addEventListener('click', (e) => {
                if (e.target === document.getElementById('edit-user-modal')) {
                    document.getElementById('edit-user-modal').remove();
                }
            });
        } else {
            showError('Ошибка', response.error || 'Не удалось загрузить данные пользователя');
        }
    }).catch(error => {
        showError('Ошибка', error.message || 'Ошибка при загрузке данных пользователя');
    });
}

async function toggleUserSubscription(username) {
    try {
        const response = await apiRequest('/api/v1/secret/admin/SuperAPI', 'POST', {
            action: 'toggle_user_subscription',
            username: currentUser.username,
            token: currentUser.token,
            target_user: username
        });

        if (response.status === 'Success') {
            showSuccessNotification(`Подписка пользователя ${username} ${response.is_frozen ? 'заморожена' : 'разморожена'}`);
            loadUsersList();
        } else {
            throw new Error(response.error || 'Ошибка изменения статуса подписки');
        }
    } catch (error) {
        console.error('Toggle subscription error:', error);
        showErrorNotification(error.message);
    }
}

// ИНИЦИАЛИЗАЦИЯ АДМИН-ПАНЕЛИ
function initAdminPanel() {
    if (!currentUser || currentUser.role !== 'Admin') return;

    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.admin-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
            
            switch(tab.dataset.tab) {
                case 'users': loadUsersList(); break;
                case 'keys': loadKeysList(); break;
                case 'stats': loadStats(); break;
            }
        });
    });

    document.getElementById('generate-key').addEventListener('click', generateKey);

    if (document.getElementById('admin-page').classList.contains('active')) {
        loadUsersList();
    }
}

function showErrorNotification(message) {
    showCustomAlert('Ошибка', message, 'error');
}

function showSuccessNotification(message) {
    showCustomAlert('Успешно', message, 'success');
}

function canGenerateInvite() {
    if (!currentUser) return false;
    
    const now = Date.now() / 1000;
    const regDays = (now - currentUser.registration_date) / 86400;
    const subDays = (currentUser.subscriptionExpiry - now) / 86400;
    
    return regDays > 1 && subDays > 1;
}

function updateInviteInfo() {
    const inviteSection = document.getElementById('invite-section');
    if (!inviteSection) return;
    
    if (canGenerateInvite()) {
        inviteSection.classList.remove('hidden');
        const inviteKey = document.getElementById('invite-key');
        
        if (currentUser.my_invite_key) {
            inviteKey.textContent = currentUser.my_invite_key;
            inviteKey.style.filter = 'blur(4px)';
            inviteKey.addEventListener('mouseover', () => {
                inviteKey.style.filter = 'none';
            });
            inviteKey.addEventListener('mouseout', () => {
                inviteKey.style.filter = 'blur(4px)';
            });
        } else {
            inviteKey.textContent = 'XXXX-XXXX-XXXX';
        }
    } else {
        inviteSection.classList.add('hidden');
    }
}

document.getElementById('generate-invite')?.addEventListener('click', async () => {
    if (!currentUser) return;
    
    try {
        const response = await apiRequest('/api/v1/site', 'POST', {
            action: 'generate_user_invite',
            username: currentUser.username,
            token: currentUser.token
        });
        
        if (response.status === 'Success') {
            currentUser.my_invite_key = response.invite_key;
            updateInviteInfo();
            showNotification('Инвайт-ключ успешно сгенерирован!');
        } else {
            showCustomAlert('Ошибка', response.message || 'Не удалось сгенерировать ключ');
        }
    } catch (error) {
        showCustomAlert('Ошибка', error.message || 'Ошибка при генерации ключа');
    }
});

document.getElementById('copy-invite')?.addEventListener('click', () => {
    if (currentUser?.my_invite_key) {
        navigator.clipboard.writeText(currentUser.my_invite_key);
        showNotification('Ключ скопирован в буфер обмена!');
    }
});

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initAdminPanel();
    
    document.querySelector('[data-page="support"]')?.addEventListener('click', () => {
        if (!currentUser) {
            showAuthPage('login');
            return;
        }
        loadTickets();
    });
    
    document.getElementById('create-ticket-btn')?.addEventListener('click', createTicket);

    // Переключение вкладок CS2 / Rust
    document.querySelectorAll(".shop-tabs .btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".shop-tabs .btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const tab = btn.getAttribute("data-tab");
            document.querySelectorAll(".shop-section").forEach(sec => sec.classList.remove("active"));
            document.getElementById(`${tab}-shop`).classList.add("active");
        });
    });

    // Переключение подразделов Rust (Devblog / Last)
    document.querySelectorAll(".shop-subtabs .btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".shop-subtabs .btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const subtab = btn.getAttribute("data-subtab");
            document.querySelectorAll(".rust-subsection").forEach(sec => sec.classList.remove("active"));
            document.getElementById(subtab).classList.add("active");
        });
    });
});

// Заглушка для loadTickets и createTicket
function loadTickets() {
    console.log('Загрузка тикетов...');
}

function createTicket() {
    console.log('Создание нового тикета...');
}