import os
import sqlite3

def main():
    # Ruta absoluta al SQLite local resolviendo de forma relativa al script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.abspath(os.path.join(script_dir, '..', '..', 'storage', 'dashboard_redes.db'))
    
    if not os.path.exists(db_path):
        print(f"Error: La base de datos SQLite no existe en {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 1. Listar cuentas
    print("--- CUENTAS ---")
    cursor.execute("SELECT id, channel_id, platform, name, enabled FROM social_accounts")
    accounts = cursor.fetchall()
    for acc in accounts:
        print(f"ID: {acc[0]} | Canal: {acc[1]} | Plataforma: {acc[2]} | Nombre: {acc[3]} | Habilitado: {acc[4]}")
    
    # 2. Contar posts por plataforma y cuenta
    print("\n--- RESUMEN PUBLICACIONES EN BD ---")
    cursor.execute("""
        SELECT a.channel_id, c.platform, COUNT(*), MIN(c.published_at), MAX(c.published_at)
        FROM content_items c
        JOIN social_accounts a ON c.account_id = a.id
        GROUP BY a.channel_id, c.platform
    """)
    for row in cursor.fetchall():
        print(f"Canal: {row[0]} | Plataforma: {row[1]} | Total Posts: {row[2]} | Min Fecha: {row[3]} | Max Fecha: {row[4]}")
        
    # 3. Ver las publicaciones mas recientes de cualquier canal
    print("\n--- ULTIMAS 5 PUBLICACIONES ---")
    cursor.execute("""
        SELECT c.id, c.title, c.published_at, c.url
        FROM content_items c
        JOIN social_accounts a ON c.account_id = a.id
        ORDER BY c.published_at DESC
        LIMIT 5
    """)
    for row in cursor.fetchall():
        print(f"ID: {row[0]} | Título: {row[1]} | Fecha: {row[2]} | URL: {row[3]}")
        
    conn.close()

if __name__ == '__main__':
    main()
