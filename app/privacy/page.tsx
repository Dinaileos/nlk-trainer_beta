export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px', color: '#fff' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '24px' }}>Политика конфиденциальности</h1>
      
      <div style={{ fontSize: '14px', lineHeight: '1.8', color: '#b3b3b3' }}>
        <p style={{ marginBottom: '20px' }}>Дата последнего обновления: 24 апреля 2026</p>
        
        <h2 style={{ fontSize: '20px', color: '#fff', marginTop: '32px', marginBottom: '16px' }}>Какие данные мы собираем</h2>
        <ul style={{ marginLeft: '20px', marginBottom: '20px' }}>
          <li><strong>Email:</strong> используется для регистрации и входа в аккаунт. Хранится в Firebase Authentication.</li>
          <li><strong>Прогресс тренировок:</strong> результаты игр, количество ошибок, история занятий.</li>
          <li><strong>Словари:</strong> пользовательские словари и добавленные слова с вариантами.</li>
        </ul>
        
        <h2 style={{ fontSize: '20px', color: '#fff', marginTop: '32px', marginBottom: '16px' }}>Где хранятся данные</h2>
        <p style={{ marginBottom: '20px' }}>
          Все данные хранятся в облачной базе данных Firebase Realtime Database. Доступ к данным имеет только владелец аккаунта.
        </p>
        
        <h2 style={{ fontSize: '20px', color: '#fff', marginTop: '32px', marginBottom: '16px' }}>Защита данных</h2>
        <ul style={{ marginLeft: '20px', marginBottom: '20px' }}>
          <li>Доступ к данным защищён правилами Firebase Security.</li>
          <li>Пароль передаётся через защищённое соединение.</li>
          <li>Данные не передаются третьим лицам.</li>
        </ul>
        
        <h2 style={{ fontSize: '20px', color: '#fff', marginTop: '32px', marginBottom: '16px' }}>Ваши права</h2>
        <p style={{ marginBottom: '20px' }}>
          Вы можете удалить свой аккаунт и все связанные данные в любой момент через настройки профиля.
        </p>
        
        <h2 style={{ fontSize: '20px', color: '#fff', marginTop: '32px', marginBottom: '16px' }}>Важно</h2>
        <p style={{ marginBottom: '20px' }}>
          Приложение находится в <strong style={{ color: '#f5a623' }}>бета-версии</strong>. Политика конфиденциальности может изменяться. 
          Рекомендуем периодически проверять эту страницу.
        </p>
        
        <h2 style={{ fontSize: '20px', color: '#fff', marginTop: '32px', marginBottom: '16px' }}>Контакты</h2>
        <p style={{ marginBottom: '40px' }}>
          По вопросам конфиденциальности обращайтесь к разработчику.
        </p>
      </div>
    </div>
  );
}